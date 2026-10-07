# Installed developer fixture

The artifact smoke script generates two isolated consumers with different repository, branch, path and tracker configuration, then runs actual Eve builds with `--skip-sandbox-prewarm`. Its host bindings fail closed for live operations. Output is not certified deployable. This proves package mounting/discovery and callback configuration survive consumer compilation; it does not perform a live provider, tracker, model or PR exercise.
