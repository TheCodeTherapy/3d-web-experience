export type GLTFWorkerRequest = {
  id: string;
} & (
  | {
      type: "load-gltf";
      fileUrl: string;
      maxTextureSize: number;
    }
  | {
      type: "cancel-load-gltf";
    }
);

export type GLTFWorkerResponse = {
  id: string;
} & (
  | {
      type: "success";
      gltfBuffer: Uint8Array;
    }
  | {
      type: "error";
      error: string;
    }
);
