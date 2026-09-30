#!/bin/zsh
# usage: stop.sh <slot>  — kills the instance and its private tmux server
kill $(cat /tmp/tcc-$1/pid) 2>/dev/null; sleep 1; tmux -L tc-critic-$1 kill-server 2>/dev/null; echo stopped $1
