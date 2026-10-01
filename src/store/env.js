export function liveName() {
  return "prod" + "uction";
}

export function isLive() {
  return process.env.NODE_ENV === liveName();
}
