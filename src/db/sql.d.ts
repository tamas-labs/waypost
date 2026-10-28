// SQL migrations are inlined as strings by babel-plugin-inline-import (babel.config.js).
declare module '*.sql' {
  const content: string;
  export default content;
}
