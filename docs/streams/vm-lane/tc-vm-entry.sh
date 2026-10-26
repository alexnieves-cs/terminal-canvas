#!/bin/sh
# M554/M555 (lane J). The network lock, then the agent.
#
# Runs as root for exactly as long as it takes to say: no packet leaves this
# VM except to the app's proxy (TC_VM_PROXY=host:port). Then it drops to the
# unprivileged `agent` user with every capability gone, so nothing the agent
# runs can lift the lock. It FAILS CLOSED: if any rule cannot be set, the
# agent never starts — a lane with prompts off and an open network is the one
# outcome this image exists to prevent.
set -eu

fail() { echo "tc-vm-entry: $*" >&2; exit 70; }

[ -n "${TC_VM_PROXY:-}" ] || fail "TC_VM_PROXY is not set; refusing to run without the network lock"
proxy_host=${TC_VM_PROXY%:*}
proxy_port=${TC_VM_PROXY##*:}
case "$proxy_port" in ''|*[!0-9]*) fail "TC_VM_PROXY has no port: $TC_VM_PROXY" ;; esac

# A name (host.docker.internal) is resolved ONCE, here, while DNS still works;
# after the lock the agent has no DNS at all and needs none: the proxy
# resolves every host it is asked for.
case "$proxy_host" in
  *[!0-9.]*) proxy_ip=$(getent ahostsv4 "$proxy_host" | awk 'NR==1 {print $1}') ;;
  *) proxy_ip=$proxy_host ;;
esac
[ -n "${proxy_ip:-}" ] || fail "could not resolve the proxy host $proxy_host"

iptables -F OUTPUT || fail "iptables is not usable here (needs NET_ADMIN)"
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -p tcp -d "$proxy_ip" --dport "$proxy_port" -j ACCEPT
iptables -P OUTPUT DROP || fail "could not set the OUTPUT policy"
# IPv6: nothing at all, and FAIL CLOSED here too. If the v6 lock cannot be
# set (no ip6tables, or a kernel without ip6 netfilter) the agent may start
# only when the VM has no routable IPv6 address — anything beyond loopback
# and link-local (fe80::/10) in /proc/net/if_inet6.
v6_locked=no
if command -v ip6tables >/dev/null 2>&1 \
  && ip6tables -F OUTPUT 2>/dev/null \
  && ip6tables -A OUTPUT -o lo -j ACCEPT 2>/dev/null \
  && ip6tables -P OUTPUT DROP 2>/dev/null; then
  v6_locked=yes
fi
if [ "$v6_locked" = no ] && [ -r /proc/net/if_inet6 ] \
  && awk '$1 != "00000000000000000000000000000001" && $1 !~ /^fe[89ab]/ { found = 1 } END { exit !found }' /proc/net/if_inet6; then
  fail "IPv6 is routable here and could not be locked"
fi

# Every lane hands over the worktree and its state folder; make sure the
# agent can write its own state (the worktree keeps the Mac's ownership).
chown agent:agent /home/agent/.claude 2>/dev/null || true

export HOME=/home/agent USER=agent
exec setpriv --reuid=agent --regid=agent --init-groups --inh-caps=-all --bounding-set=-all --no-new-privs -- "$@"
