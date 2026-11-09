export const skill = `# Standard UI: ui

Use this plugin for application interfaces, forms, overlays, navigation, data displays, device frames and HTML fallback content. It is enabled by default; do not add the same plugin again to config.plugins.

## Start and verify
- Keep importing author markers from @joplo-app/kit/ui and write normal TSX. The compiler emits ui:Button and other namespaced types; write HTML tags directly, which compile to ui:div, ui:span, etc.
- Read joplo skill components for the enabled catalog; joplo components Menu DataTable gives props, behavior groups and runnable author snippets. If two plugins share a short name, request the full namespaced name.
- Give interactive elements stable ids. Describe their behavior with flow steps, disabled plus disabledReason, or unmodeled. Run check, then render the affected steps; passing schema validation alone does not prove the intended screen is visible.

## State and visibility
- type / select / toggle steps write inputs[id]. Use value, checked or defaultValue for initial visuals; viewers do not edit the demo's business state directly.
- Select accepts the displayed label or stored value; MultiSelect toggles membership. For a bound option list, ensure the list exists before the select step.
- Modal and Drawer use opened, with open as a legacy fallback only when opened is absent. Menu forwards opened to its own dropdown; an explicitly set child value wins, and a nested menu owns its own state.
- AppShell regions and Phone child width use the same declared layout data as playback. A narrow screen can hide a target even when when is true; check the actual viewport before changing the step.
- Image accepts embedded project assets via asset('./photo.jpg'). URLs and ordinary paths intentionally draw a placeholder; fix IMAGE_PLACEHOLDER by embedding the file. fit accepts cover or contain.
- Display properties are declared per component for translation. Identifiers, structural values and unrelated props are not automatically display text; for custom content, declare text or exact textPaths traits in its own plugin. For nested data, target titles/labels precisely; do not translate an entire configuration object containing colors or identifiers.

## Migration and recovery
- PLUGIN_LEGACY_TYPE means old bare component IR: rebuild the author project using the current kit. Do not search-and-replace TSX tags with ui: names or edit generated IR to make schema errors disappear.
- Feature diff of pre-plugin UI IR reports incompatible and requests rebuilding both versions. Existing published shares still carry their original runtime and keep working offline.
- Plugin unavailable placeholders indicate a missing or mismatched runtime: reinstall matching package versions and rerun build. The ui catalog, runtime and kit markers are checked together by the release smoke test. Runtime imports must be production dependencies or explicit shared host services: a working workspace or prebuilt web bundle does not prove the package runtime can load after a clean install.

Related topics: components, authoring, focus, check, plugins
`;
