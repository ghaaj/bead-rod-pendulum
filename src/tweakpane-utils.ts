import { BindingApi, BladeApi, TpChangeEvent } from "@tweakpane/core";

export function isBindingApi(api: BladeApi): api is BindingApi {
  return "key" in api;
}

export function unsafeGetBinding<
  B extends { key: string; value: unknown },
>(
  { target, value }: TpChangeEvent<unknown, BladeApi>,
): B | undefined {
  if (!isBindingApi(target)) return;
  return { key: target.key, value } as B;
}
