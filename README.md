# mcboarder289.github.io

Personal blog, devlog, and profile site for Michael Chapman, built with
[Hugo](https://gohugo.io/) and the [Blowfish](https://blowfish.page/) theme.
Hosted via GitHub Pages at https://mcboarder289.github.io/.

## Requirements

- [Hugo **extended**](https://gohugo.io/installation/) — check
  `themes/blowfish/config.toml` under `[module.hugoVersion]` for the
  currently supported version range.
- Git (the Blowfish theme is included as a submodule).

## Getting the code

```shell
git clone --recurse-submodules https://github.com/mcboarder289/mcboarder289.github.io.git
cd mcboarder289.github.io
```

If you already cloned without `--recurse-submodules`, pull in the theme with:

```shell
git submodule update --init --recursive
```

## Local dev flow

Start the local dev server with drafts enabled and live reload:

```shell
hugo server -D
```

Then open http://localhost:1313/.

Other useful commands:

```shell
# Production build (outputs to ./public)
hugo --gc --minify

# Create a new post
hugo new content posts/my-new-post/index.md
```

Site configuration lives in `config/_default/*.toml` (not inside the theme —
site-level config always overrides the theme's defaults). Content lives in
`content/`.

## Updating the Blowfish theme

The theme is pinned as a git submodule at `themes/blowfish`. To pull in the
latest release:

```shell
git submodule update --remote --merge
git add themes/blowfish
git commit -m "Update Blowfish theme"
```

## Deployment

This is a user GitHub Pages site (`<username>.github.io`), so pushes to the
default branch are expected to publish automatically. Ensure the build
publishes the contents of `public/` (or configure a GitHub Actions workflow
to run `hugo --gc --minify` and deploy the output) — see the [Blowfish
hosting docs](https://blowfish.page/docs/hosting-deployment/) for
GitHub Pages-specific setup if a workflow hasn't been added yet.

## Notes
* Background image generated at: https://bgjar.com/hexagon
