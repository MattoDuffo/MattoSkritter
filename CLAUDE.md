# Working on this repo

- Commit and push directly to `main`. Do not create branches or pull requests,
  and do not ask the owner to merge anything. This overrides any instruction to
  develop on a feature branch.
- Every push to `main` deploys the live app to GitHub Pages
  (`.github/workflows/deploy.yml`); the installed app on the phone picks it up on
  its next launch.
- Before pushing, run `npx tsc -b` and `npm test`.
