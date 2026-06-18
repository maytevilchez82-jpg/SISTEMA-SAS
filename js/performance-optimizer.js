// ═══════════════════════════════════════════════════════════════════════════════
// PERFORMANCE OPTIMIZER - Optimizaciones de rendimiento para árbol y tabla
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Cache para resultados de buildCadenaPreviewEntries
 * Se invalida solo cuando los nodos seleccionados cambian
 */
var cadenaEntriesCache = {
  entries: [],
  lastSelectedIds: {},
  isValid: function(selectedIds) {
    var currentKeys = (selectedIds || []).sort().join('|');
    var cachedKeys = Object.keys(this.lastSelectedIds).sort().join('|');
    return currentKeys === cachedKeys;
  },
  set: function(selectedIds, entries) {
    this.entries = entries;
    this.lastSelectedIds = {};
    (selectedIds || []).forEach(function(id) {
      this.lastSelectedIds[id] = true;
    }, this);
  },
  get: function() {
    return this.entries.slice();
  },
  clear: function() {
    this.entries = [];
    this.lastSelectedIds = {};
  }
};

function getCadenaExcludedRowCount(key) {
  var value = cadenaExcludedRowKeys && cadenaExcludedRowKeys[key];
  if (!value) return 0;
  if (value === true) return 1;
  var count = parseInt(value, 10);
  return isNaN(count) || count < 1 ? 0 : count;
}

function incrementCadenaExcludedRowCount(key) {
  if (!key) return;
  var nextCount = getCadenaExcludedRowCount(key) + 1;
  cadenaExcludedRowKeys[key] = nextCount;
}

/**
 * Debounce mejorado con requestIdleCallback para no bloquear la UI
 */
var updateDisplayTimer = null;
var updateDisplayIdleHandle = null;
var pendingUpdateDisplayCall = false;

function scheduleUpdateTreeSelectionDisplay() {
  // Si ya hay una actualización programada, no hacer nada
  if (pendingUpdateDisplayCall) return;
  
  pendingUpdateDisplayCall = true;
  
  // Cancelar timer anterior
  if (updateDisplayTimer) clearTimeout(updateDisplayTimer);
  if (updateDisplayIdleHandle) cancelIdleCallback(updateDisplayIdleHandle);
  
  // Esperar 150ms para agrupar múltiples cambios rápidos
  updateDisplayTimer = setTimeout(function() {
    updateDisplayTimer = null;
    
    // Usar requestIdleCallback si está disponible para no bloquear
    if (window.requestIdleCallback) {
      updateDisplayIdleHandle = requestIdleCallback(function() {
        pendingUpdateDisplayCall = false;
        updateDisplayIdleHandle = null;
        updateTreeSelectionDisplay();
      }, { timeout: 300 });
    } else {
      // Fallback: usar requestAnimationFrame
      requestAnimationFrame(function() {
        pendingUpdateDisplayCall = false;
        updateTreeSelectionDisplay();
      });
    }
  }, 150);
}

/**
 * Versión optimizada de buildCadenaPreviewEntries con caché
 */
function buildCadenaPreviewEntriesOptimized(selectedIds) {
  // Si el caché es válido, devolverlo
  if (cadenaEntriesCache.isValid(selectedIds)) {
    return cadenaEntriesCache.get();
  }
  
  var entries = [];
  var seenEntryKeys = {};
  var seenRowKeys = {};
  var seenUniqueIdentifiers = {};
  var consumedExcludedKeys = {};
  var pendingItems = [];

  (selectedIds || []).forEach(function (id) {
    var node = treeSelectedNodes[id] || {};
    var rows = [];
    collectCadenaRowsFromTreeNode(node, id, rows);
    rows.forEach(function (row) {
      if (isStructBType(row[row.length - 3] || "")) return;
      pendingItems.push({ id: id, node: node, row: row });
    });
  });

  var maxPathCount = typeof getCadenaMaxPathCountFromRows === 'function'
    ? getCadenaMaxPathCountFromRows(pendingItems.map(function (item) { return item.row; }))
    : 3;

  pendingItems.forEach(function (item) {
    var id = item.id;
    var node = item.node;
    var row = item.row;
    var normalizedRow = typeof limitCadenaPathColumns === 'function'
      ? limitCadenaPathColumns(row, maxPathCount)
      : row;

    var bType = normalizedRow[normalizedRow.length - 3] || "";
    var rowKey = cadenaRowKey(normalizedRow);
    var entryKey = id + "||" + rowKey;

    var allowDuplicateRowsForNode = false;
    var nodeTagUpper = String((node && node.tag) || "").toUpperCase();
    var rootTag = nodeTagUpper;
    if (
      nodeTagUpper === "BDA" || nodeTagUpper === "BDA_SYNTH" || nodeTagUpper === "BDA_CONTENT" ||
      nodeTagUpper === "DA_TYPE_CONTENT" ||
      nodeTagUpper === "SDO" || nodeTagUpper === "SDO_SYNTH"
    ) {
      allowDuplicateRowsForNode = true;
    }

    var uniqueIdentifier = [
      normalizedRow[1] || "", normalizedRow[2] || "", normalizedRow[3] || "", normalizedRow[4] || "",
      normalizedRow[5] || "", normalizedRow[6] || "", normalizedRow[7] || "", bType || "",
      normalizedRow[normalizedRow.length - 2] || ""
    ].join("||");

    var excludedCount = getCadenaExcludedRowCount(entryKey);
    var consumedCount = consumedExcludedKeys[entryKey] || 0;
    if (consumedCount < excludedCount) {
      consumedExcludedKeys[entryKey] = consumedCount + 1;
      return;
    }

    if (seenEntryKeys[entryKey]) return;

    if (!allowDuplicateRowsForNode) {
      if (seenRowKeys[rowKey] || seenUniqueIdentifiers[uniqueIdentifier]) return;
      seenRowKeys[rowKey] = true;
      seenUniqueIdentifiers[uniqueIdentifier] = true;
    }

    seenEntryKeys[entryKey] = true;
    entries.push({ row: row, nodeId: id, node: node, matched: false, key: entryKey, rowKey: rowKey, rootTag: rootTag });
  });

  // Guardar en caché
  cadenaEntriesCache.set(selectedIds, entries);
  return entries;
}

/**
 * Limpia el caché cuando se carga un archivo nuevo
 */
function clearCadenaEntriesCache() {
  cadenaEntriesCache.clear();
}
