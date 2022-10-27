import { Left, Right } from "fp-ts/lib/Either";
import { ServiceDataSuccessResponse } from "../service_data";

describe("Response decode", () => {
  it("should validate an Organization with no services", () => {
    const mockResponse: unknown = { items: [] };
    const decodedResponse = ServiceDataSuccessResponse.decode(mockResponse);
    expect(decodedResponse).toBeInstanceOf(Right);
  });

  it("should validate an Organization with services", () => {
    const mockResponse: unknown = {
      items: [
        {
          id: "12345678901",
          isVisible: true,
          name: "Test Service"
        },
        {
          id: "12345678902",
          isVisible: false,
          name: "Test Service"
        }
      ]
    };
    const decodedResponse = ServiceDataSuccessResponse.decode(mockResponse);
    expect(decodedResponse).toBeInstanceOf(Right);
  });

  it("should not validate an invalid Response", () => {
    const mockResponse: unknown = { data: [] };
    const decodedResponse = ServiceDataSuccessResponse.decode(mockResponse);
    expect(decodedResponse).toBeInstanceOf(Left);
  });
});
