/** 所有消费者共用编译器的功能顺序；旧 IR 只沿用已有的对象顺序，不在读取端重新排序。 */
export function orderedFeatures<T>(project: { features: Record<string, T>; featureIds?: readonly string[] }): T[] {
  return (project.featureIds ?? Object.keys(project.features)).map(id => project.features[id]).filter((f): f is T => f !== undefined);
}
