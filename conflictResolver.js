/**
 * Resuelve conflictos entre un nodo existente y un cambio entrante.
 * @param {Object} currentNode - El nodo actual en el grafo.
 * @param {Object} incomingChange - El cambio entrante (puede ser local o remoto).
 * @param {HybridClock} hybridClock - La instancia del reloj híbrido.
 * @returns {Object} - Resultado de la resolución del conflicto.
 */
export const resolveConflict = (currentNode, incomingChange, hybridClock) => {
  // Si no existe un nodo actual, aplicar el cambio automáticamente
  if (!currentNode || !currentNode.timestamp) {
    return { resolved: true, value: incomingChange.value, timestamp: incomingChange.timestamp }
  }

  const incomingTimestamp = incomingChange.timestamp
  const currentTimestamp = currentNode.timestamp

  // Comparar los timestamps usando el reloj híbrido
  const comparison = hybridClock.compare(currentTimestamp, incomingTimestamp)

  // Aplicar el cambio si el timestamp entrante es más reciente
  if (comparison < 0) {
    return { resolved: true, value: incomingChange.value, timestamp: incomingChange.timestamp }
  }

  // Mantener el nodo actual si es más reciente o igual
  return { resolved: false }
}
