/** Combine plugin-owned CSS with author CSS; author themes keep their existing IR semantics. */
export function projectThemes(project: { themes?: Record<string, string>; plugins?: Record<string, { themes?: Record<string, string> }> } | null | undefined): Record<string, string> {
  const pluginThemes = Object.fromEntries(Object.entries(project?.plugins ?? {}).flatMap(([id, plugin]) => Object.entries(plugin.themes ?? {}).map(([name, css]) => [`${id}:${name}`, css])));
  return { ...pluginThemes, ...project?.themes };
}
