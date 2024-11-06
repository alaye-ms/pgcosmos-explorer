import { ResourceResponse } from "../../request";
export class ConflictResponse extends ResourceResponse {
    constructor(resource, headers, statusCode, conflict, diagnostics) {
        super(resource, headers, statusCode, diagnostics);
        this.conflict = conflict;
    }
}
//# sourceMappingURL=ConflictResponse.js.map