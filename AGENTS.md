# Operational Rules

## Zip Request Behavior
When the user asks to create a zip (e.g. "zipを作って"), use this default behavior:

- Create the archive under `dest/`.
- Zip the whole project except the `dest/` directory itself.
- Overwrite the existing zip if the same file name already exists.
