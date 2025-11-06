declare module "base64:*" {
  const content: string;
  export default content;
}

declare module "*.svg" {
  const content: string;
  export default content;
}

declare module "*.css" {
  const classes: { [key: string]: string };
  export default classes;
}
