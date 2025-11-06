export type LegacyUserNetworkingClientUpdate = {
  id: number;
  position: { x: number; y: number; z: number };
  rotation: { quaternionY: number; quaternionW: number };
  state: number;
};

export class LegacyUserNetworkingCodec {
  static encodeUpdate(update: LegacyUserNetworkingClientUpdate): Uint8Array {
    const buffer = new ArrayBuffer(19);
    const dataView = new DataView(buffer);
    dataView.setUint16(0, update.id); // id
    dataView.setFloat32(2, update.position.x); // position.x
    dataView.setFloat32(6, update.position.y); // position.y
    dataView.setFloat32(10, update.position.z); // position.z
    dataView.setInt16(14, update.rotation.quaternionY * 32767); // quaternion.y
    dataView.setInt16(16, update.rotation.quaternionW * 32767); // quaternion.w
    dataView.setUint8(18, update.state); // animationState
    return new Uint8Array(buffer);
  }

  static decodeUpdate(buffer: ArrayBuffer): LegacyUserNetworkingClientUpdate {
    const dataView = new DataView(buffer);
    const id = dataView.getUint16(0); // id
    const x = dataView.getFloat32(2); // position.x
    const y = dataView.getFloat32(6); // position.y
    const z = dataView.getFloat32(10); // position.z
    const quaternionY = dataView.getInt16(14) / 32767; // quaternion.y
    const quaternionW = dataView.getInt16(16) / 32767; // quaternion.w
    const state = dataView.getUint8(18); // animationState
    const position = { x, y, z };
    const rotation = { quaternionY, quaternionW };
    return { id, position, rotation, state };
  }
}
