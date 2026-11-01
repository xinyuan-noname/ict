export const NativeModules: Record<string, unknown> = {};
export const Platform = { OS: 'android', select: <T,>(spec: { android?: T; ios?: T; default?: T }): T | undefined => spec.android ?? spec.default };
export default { NativeModules, Platform };