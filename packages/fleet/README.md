# Fleet baseline utilities

`validateBaseline` requires schema version 1, exact component/SDK pins, capability names, configuration-key names and a runtime major. It does not contain a fleet registry.

`compareBaseline` returns read-only differences between the approved baseline and an application's declared versions, installed versions, capabilities, configured keys and deployment evidence. Missing, inaccessible, retired and deployment-unverified states remain explicit. A matching manifest/lock is not a verified deployment.

`installedFromNpmLock` reads resolved package versions from npm lockfiles v2/v3. Select the correct consumer-relative prefix explicitly. Other package managers require host adapters; do not treat an unsupported lock format as healthy.

Keep owner, repository, deployment project, identity and credential values in private inventory. The checker neither changes files nor creates tickets, pushes upgrades or deploys. A host can use the differences to prepare owner-reviewed adoption PRs.
