# Third-Party Notices

This project depends on third-party software and may connect to third-party AI,
storage, email, and infrastructure services. Those components and services are
governed by their own licenses and terms, not by this project's
AGPL-3.0-only license.

## Software dependencies

The authoritative dependency list and resolved versions are recorded in
`package.json` and `package-lock.json`. Redistributors are responsible for
preserving notices and satisfying the licenses of the dependency versions they
ship.

The runtime currently includes `@ffmpeg-installer/ffmpeg`. Its platform binary
packages may use GPL or LGPL terms depending on the target platform and build.
Before distributing a Docker image or other binary bundle, review the exact
FFmpeg package selected for that target and satisfy its applicable source and
notice obligations.

## External services

Optional integrations include OpenAI or OpenAI-compatible APIs, Moonshot/Kimi,
Seedance/Volcengine, S3-compatible storage, and SMTP providers. Operators must
obtain their own credentials and comply with each provider's terms, privacy
policy, usage restrictions, and fees.

## Assets with separate terms

The following operator or brand materials are not granted an AGPL-3.0-only
license merely by being used with the project:

- Operator-provided payment QR images or URLs
- Brand assets under `public/brand/`, which are covered by `TRADEMARKS.md`

The JPG style thumbnails under `public/style-thumbnails/custom/` and the
built-in prompt framework are maintained as original project assets under
AGPL-3.0-only.

User-provided and user-generated stories, prompts, images, audio, and videos
remain subject to the rights of their respective owners and are not relicensed
under AGPL-3.0-only by this project.
