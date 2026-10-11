// Ink scripts are compiled to JSON by the inkStories plugin in vite.config.ts.
declare module '*.ink' {
  const story: string;
  export default story;
}
