# A self-hosted runner on the Mac mini, for the families a hosted runner cannot reach

Needed for a family blocked from GitHub's runners. Workday is one: it answers 429 to a hosted runner's first request
and 200 to a home address. The repository variable `REFRESH_SELF_HOSTED` (Settings > Secrets and variables > Actions >
Variables) names those families, comma-separated (`workday`); the gate job of each refresh workflow gives their jobs
`"runner": ["self-hosted", "macOS"]` and everything else in the workflow stays. Set the variable only once the runner
shows Idle: a job for a runner that does not exist waits in the queue and holds the refresh's build job with it.
One runner takes one job at a time, so a family split in shards runs them one after the other. The runner is GitHub's own agent, installed
as a launchd service so it survives a reboot and a login; the job it runs is the same checkout, the same `pip
install`, the same commands as on a hosted runner, so nothing on the Mac is used except its network address and
its CPU.

## Install (GitHub's steps, once)

1. On GitHub: the repository > Settings > Actions > Runners > New self-hosted runner > macOS, arm64. The page shows
   the download, the configure and the run commands with a fresh registration token (it expires in an hour).
2. On the Mac mini, in Terminal, as the user who stays logged in:

```bash
mkdir -p ~/actions-runner && cd ~/actions-runner
# the curl and tar lines from the page (the runner's tarball, its checksum)
./config.sh --url https://github.com/wfkhan97/product-role-atlas --token <from the page> --name mac-mini --labels macOS --unattended
```

   Accept the default runner group and work folder. The labels GitHub gives every macOS runner (`self-hosted`,
   `macOS`, `ARM64`) plus `macOS` again is what the matrix asks for.
3. Run it as a service, so it starts at boot and restarts if it stops:

```bash
./svc.sh install
./svc.sh start
./svc.sh status
```

   The service runs as the logged-in user (launchd user agent). The Mac mini must stay on; it may sleep only if
   "Wake for network access" is on and a job can wake it, so set Energy > Prevent automatic sleeping to on. Check
   on GitHub: Settings > Actions > Runners shows `mac-mini` as Idle.
4. Python 3.12 or newer and git on the Mac (`python3 --version`); `actions/setup-python` on a self-hosted macOS runner
   downloads its own Python into the runner's tool cache the first time and reuses it after. Node 22 is only needed
   by the build job, which stays on `ubuntu-latest`.

## What the runner needs from the Mac, and what it does not

- No `.env`: the jobs read the three Supabase values from the repository's Actions secrets, on the Mac mini exactly
  as on a hosted runner (the secrets travel with the job). Keep the Mac's own `.env` for hand runs; the runner's
  work folder (`~/actions-runner/_work/`) is its own checkout and never sees it.
- The runner's folder is outside the repository checkout; it is not the Mac's `product-role-atlas` clone, and a
  hand run on the Mac does not interfere with a job.
- The runner's network address is the Mac's home address, which is the point: a board that blocks datacenter
  ranges answers a residential one.

## When something goes wrong

- A job stays queued with "Waiting for a runner": the service is down (`./svc.sh status`; `./svc.sh start`), the Mac
  is asleep, or the labels do not match the matrix entry.
- The runner updates itself; `./svc.sh stop && ./svc.sh start` after an update that did not restart.
- To remove it: `./svc.sh stop && ./svc.sh uninstall`, then `./config.sh remove --token <a removal token from the
  Runners page>`.

GitHub's reference: Settings > Actions > Runners > the runner's page, and docs.github.com, "Adding self-hosted
runners" and "Configuring the self-hosted runner application as a service".
