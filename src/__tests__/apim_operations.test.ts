import { NonEmptyString } from "italia-ts-commons/lib/strings";
import { parseOwnerIdFullPath } from "../apim_operations";

describe("Get Owner Id from Full Path", () => {
  it("should retrieve the ID", () => {
    const res = parseOwnerIdFullPath(
      "/subscriptions/subid/resourceGroups/{resourceGroup}/providers/Microsoft.ApiManagement/service/{apimService}/users/5931a75ae4bbd512a88c680b" as NonEmptyString
    );
    expect(res).toBe("5931a75ae4bbd512a88c680b");
  });
});
