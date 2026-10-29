const GRAUS_PARA_RAD = Math.PI / 180
const KM_POR_GRAU_LAT = 110.574
const KM_POR_GRAU_LON = 111.32
const RAIO_TERRA_KM = 6371

export function areaKm2(anel: number[][]): number {
  if (!anel || anel.length < 3) {
    return 0
  }
  const pontos =
    anel.length > 1 &&
    anel[0][0] === anel[anel.length - 1][0] &&
    anel[0][1] === anel[anel.length - 1][1]
      ? anel.slice(0, -1)
      : anel
  const latMedia = pontos.reduce((soma, ponto) => soma + ponto[1], 0) / pontos.length
  const kx = KM_POR_GRAU_LON * Math.cos(latMedia * GRAUS_PARA_RAD)
  const ky = KM_POR_GRAU_LAT
  let soma = 0
  for (let i = 0; i < pontos.length; i += 1) {
    const atual = pontos[i]
    const proximo = pontos[(i + 1) % pontos.length]
    soma += atual[0] * kx * (proximo[1] * ky) - proximo[0] * kx * (atual[1] * ky)
  }
  return Math.abs(soma / 2)
}

export function distanciaKm(a: [number, number], b: [number, number]): number {
  const dLat = (b[1] - a[1]) * GRAUS_PARA_RAD
  const dLon = (b[0] - a[0]) * GRAUS_PARA_RAD
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * GRAUS_PARA_RAD) *
      Math.cos(b[1] * GRAUS_PARA_RAD) *
      Math.sin(dLon / 2) ** 2
  return 2 * RAIO_TERRA_KM * Math.asin(Math.sqrt(h))
}

export function formatarKm2(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}

export function formatarKm(valor: number): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: 1 })
}
