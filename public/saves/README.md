# Saves

`npm run render` loads `latest.json`, plays the next episode, and writes
`world-after-epNNN.json` plus a new `latest.json` here automatically. Commit
them with the episode's logs so any episode can be re-rendered exactly.

To re-render an earlier episode, copy the save from before it (e.g.
`world-after-ep003.json` to re-render episode 4) to `latest.json` and use
`npm run render -- --dry` so nothing is overwritten.

With no `latest.json`, a fresh world starts at episode 1 (`--fresh` forces
that). In the browser, `?fresh` ignores the save.
