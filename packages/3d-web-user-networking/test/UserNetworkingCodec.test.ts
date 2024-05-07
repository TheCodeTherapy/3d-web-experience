import { UserNetworkingClientUpdate, UserNetworkingCodec } from "../src/UserNetworkingCodec";

describe("UserNetworkingCodec", () => {
  const cases: Array<[string, UserNetworkingClientUpdate, Uint8Array]> = [
    [
      "normal case",
      {
        id: 123,
        position: { x: 1, y: 2, z: 3 },
        rotation: { quaternionY: 0.25, quaternionW: 0.5 },
        state: 3,
      },
      new Uint8Array([0, 123, 63, 128, 0, 0, 64, 0, 0, 0, 64, 64, 0, 0, 31, 255, 63, 255, 3]),
    ],
    [
      "zero case",
      {
        id: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: { quaternionY: 0, quaternionW: 0 },
        state: 0,
      },
      new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ],
    [
      "maximum value case",
      {
        id: 65535,
        position: {
          x: 3.4028234663852885981170418348451692544e38,
          y: -3.4028234663852885981170418348451692544e38,
          z: 3.4028234663852885981170418348451692544e38,
        },
        rotation: { quaternionY: -1, quaternionW: 1 },
        state: 5,
      },
      new Uint8Array([
        255, 255, 127, 127, 255, 255, 255, 127, 255, 255, 127, 127, 255, 255, 128, 1, 127, 255, 5,
      ]),
    ],
  ];
  test.each(cases)("%p: should encode and decode", (testCaseName, clientUpdate, expectedResult) => {
    const encoded = UserNetworkingCodec.encodeUpdate(clientUpdate);
    expect(encoded).toStrictEqual(expectedResult);
    const decoded = UserNetworkingCodec.decodeUpdate(encoded.buffer);
    expect(decoded).toEqual({
      id: clientUpdate.id,
      position: {
        x: expect.closeTo(clientUpdate.position.x, 4),
        y: expect.closeTo(clientUpdate.position.y, 4),
        z: expect.closeTo(clientUpdate.position.z, 4),
      },
      rotation: {
        quaternionY: expect.closeTo(clientUpdate.rotation.quaternionY, 4),
        quaternionW: expect.closeTo(clientUpdate.rotation.quaternionW, 4),
      },
      state: clientUpdate.state,
    });
  });
});
