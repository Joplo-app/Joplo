---
name: joplo-plugin-ui
description: "Use the Standard UI plugin in Joplo; read its entry, component recipes and recovery rules for this project."
---

# Joplo plugin ui: Standard UI 0.6.0

Author package: @joplo-app/plugin-ui
# Standard UI: ui

Use this plugin for application interfaces, forms, overlays, navigation, data displays, device frames and HTML fallback content. Install @joplo-app/plugin-ui, import ui from it and list ui in config.plugins. The engine enables nothing implicitly.

## Start and verify
- Import author markers directly from @joplo-app/plugin-ui and write normal TSX. The compiler emits ui:Button and other namespaced types; write HTML tags directly, which compile to ui:div, ui:span, etc.
- Read joplo skill ui/components for the enabled catalog; joplo components Menu DataTable gives props, behavior groups and runnable author snippets. If two plugins share a short name, request the full namespaced name.
- Give interactive elements stable ids. Describe their behavior with flow steps, disabled plus disabledReason, or unmodeled. Run check, then render the affected steps; passing schema validation alone does not prove the intended screen is visible.

## State and visibility
- type / select / toggle steps write inputs[id]. Use value, checked or defaultValue for initial visuals. Paused audiences can type (including multiline PromptInput), change Switch/Checkbox/Radio/Select/SegmentedControl, switch Tabs and expand Accordion locally; value/checked bindings synchronize local views. Playing, jumping or Reset discards these edits. A matching next scripted action wins; an action in another reachable scenario asks to switch.
- Select accepts the displayed label or stored value; MultiSelect toggles membership. For a bound option list, ensure the list exists before the select step.
- Modal and Drawer use opened, only; the old open alias is not supported. Menu forwards opened to its own dropdown; an explicitly set child value wins, and a nested menu owns its own state.
- AppShell regions and Phone child width use the same declared layout data as playback. A narrow screen can hide a target even when when is true; check the actual viewport before changing the step.
- Image accepts embedded project assets via asset('./photo.jpg'). URLs and ordinary paths intentionally draw a placeholder; fix IMAGE_PLACEHOLDER by embedding the file. fit accepts cover or contain.
- Display properties are declared per component for translation. Identifiers, structural values and unrelated props are not automatically display text; for custom content, declare text or exact textPaths traits in its own plugin. For nested data, target titles/labels precisely; do not translate an entire configuration object containing colors or identifiers.

## Migration and recovery
- Plugin unavailable placeholders indicate a missing or mismatched runtime: reinstall matching package versions and rerun build. The ui catalog, runtime and author markers are checked together by the release smoke test. Runtime imports must be production dependencies or explicit shared host services: a working workspace or prebuilt web bundle does not prove the package runtime can load after a clean install.

Related topics: components, authoring, focus, check, plugins

- npx joplo skill ui/components: Component props and author examples
- npx joplo skill ui/patterns: UI recipes and individual pitfalls

General engine contracts: npx joplo skill plugins


## Installed references
- [components](./topics/components.md): Component props and author examples
- [patterns](./topics/patterns.md): UI recipes and individual pitfalls

Engine contracts: [plugins](../joplo/topics/plugins.md).
<!-- joplo-skill 0.6.0 sha256:e961f09fff93a98fbd09012a75a3b78a98c660d16c2c46e03cd28b5aa8e98ea5 -->
