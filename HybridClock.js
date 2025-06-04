export class HybridClock {
  constructor() {
    this.physical = Date.now()
    this.logical = 0
  }

  now() {
    const currentPhysical = Date.now()
    this.physical = Math.max(this.physical, currentPhysical)
    this.logical++
    return { physical: this.physical, logical: this.logical }
  }

  update(remoteTimestamp) {
    if (
      !remoteTimestamp ||
      typeof remoteTimestamp.physical !== 'number' ||
      typeof remoteTimestamp.logical !== 'number'
    ) return

    this.physical = Math.max(this.physical, remoteTimestamp.physical)
    this.logical = Math.max(this.logical, remoteTimestamp.logical) + 1
  }

  // compare (ts1, ts2) {
  //   if (!ts1 && !ts2) return 0
  //   if (!ts1) return -1
  //   if (!ts2) return 1

  //   if (ts1.logical > ts2.logical) return 1
  //   if (ts1.logical < ts2.logical) return -1
  //   return ts1.physical - ts2.physical
  // }
  // CÓDIGO CORREGIDO - compare
  compare(ts1, ts2) {
    if (!ts1 && !ts2) return 0
    if (!ts1) return -1
    if (!ts2) return 1

    // LÓGICA CORREGIDA
    if (ts1.physical > ts2.physical) return 1
    if (ts1.physical < ts2.physical) return -1
    // Si los físicos son iguales, compara los lógicos
    if (ts1.logical > ts2.logical) return 1
    if (ts1.logical < ts2.logical) return -1
    return 0 // Son completamente iguales
  }
}
