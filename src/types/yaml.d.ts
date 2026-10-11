// Content files are turned into plain data by the YAML plugin in vite.config.ts.
// Their shape is unknown until checked against a schema in src/content/.
declare module '*.yaml' {
  const data: unknown;
  export default data;
}
