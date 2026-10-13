/** Statik varlık yolları: site bir alt dizinde (ör. GitHub Pages) yayınlandığında önek eklenir */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export function asset(path: string): string {
  return `${BASE_PATH}${path}`;
}
