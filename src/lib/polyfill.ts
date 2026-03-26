/* eslint-disable @typescript-eslint/no-explicit-any */
if (typeof (globalThis as any).DOMParser === 'undefined') {
  (globalThis as any).DOMParser = class DOMParser {
    parseFromString(string: string) {
      return {
        documentElement: string,
        getElementsByTagName: () => [],
        querySelector: () => null,
        querySelectorAll: () => []
      };
    }
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */