# The Homebrew cask (M631). This repository is its own tap:
#
#   brew tap alexnieves-cs/terminal-canvas https://github.com/alexnieves-cs/terminal-canvas
#   brew install --cask terminal-canvas
#
# `version :latest` and `sha256 :no_check` on purpose. The URLs are the
# versionless copies release.yml's publish job uploads, so GitHub's
# releases/latest/download/ always serves the newest release and this file
# never needs an edit (or a bot with push rights to main) per release. The
# cost is that Homebrew cannot check the download against a pinned hash; the
# release's SHA256SUMS.txt is there for anyone who wants to.
# verify:package cask.1-2 pin the names against the workflow that makes them.
cask "terminal-canvas" do
  arch arm: "arm64", intel: "x64"

  version :latest
  sha256 :no_check

  url "https://github.com/alexnieves-cs/terminal-canvas/releases/latest/download/Terminal-Canvas-#{arch}.dmg"
  name "Terminal Canvas"
  desc "Infinite canvas for coding agents: real terminals, attention and review"
  homepage "https://github.com/alexnieves-cs/terminal-canvas"

  app "Terminal Canvas.app"

  zap trash: [
    "~/Library/Application Support/Terminal Canvas",
    "~/Library/Preferences/com.alexnieves.terminal-canvas.plist",
    "~/Library/Saved Application State/com.alexnieves.terminal-canvas.savedState",
  ]

  caveats <<~EOS
    If macOS refuses to open Terminal Canvas because it is not signed, allow it
    once in System Settings → Privacy & Security → Open Anyway, or run:
      xattr -dr com.apple.quarantine "/Applications/Terminal Canvas.app"
    Agents survive a reload when tmux is installed: brew install tmux
  EOS
end
