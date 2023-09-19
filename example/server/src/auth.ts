import express from "express";

export function authMiddleware(serverPassword: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (typeof req.headers["x-custom-auth"] !== undefined) {
      if (req.headers["x-custom-auth"] === serverPassword) {
        return next();
      }
    }

    // Removed the setting of the WWW-Authenticate header
    res.status(401).send("Authentication required.");
  };
}
