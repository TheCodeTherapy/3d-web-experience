declare module "*.glb" {
  const filePath: string;
  export default filePath;
}

declare module "base64:*" {
  const content: string;
  export default content;
}
