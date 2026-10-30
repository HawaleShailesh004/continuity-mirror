/** Mock mode returns stand-in images of other people, so there is nothing true to check; `NEXT_PUBLIC_RESULT_CHECK=0` is the off switch. */
export function checkEnabled(): boolean {
  return process.env.NEXT_PUBLIC_API_MOCKS !== "1" && process.env.NEXT_PUBLIC_RESULT_CHECK !== "0";
}
