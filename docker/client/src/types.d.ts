declare module "*.module.css" {
  const classes: Record<string, string>;
  export default classes;
}

declare module "*.png" {
  const path: string;
  export default path;
}

declare module "*.jpg" {
  const path: string;
  export default path;
}

declare module "*.jpeg" {
  const path: string;
  export default path;
}
