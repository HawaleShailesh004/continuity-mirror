// Anything under /api without a route gets the JSON error envelope, not Next's HTML 404.
import { errorBody } from "@/lib/contracts/errors";
import { errorResponse } from "@/lib/server/http/errors";

function notFound() {
  return errorResponse(errorBody("NOT_FOUND"));
}

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
