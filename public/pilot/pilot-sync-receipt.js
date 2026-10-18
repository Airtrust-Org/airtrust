// Completion is idempotent across lost HTTP replies and local storage errors.
// Never delete the encrypted outbox until BOTH the server receipt and the
// matching local draft's acknowledged state have been durably persisted.
export async function persistPilotFinalSyncResult({
  vault, outboxRecord, result, receiptId, markAccepted,
}) {
  const command = outboxRecord?.value?.command;
  if (!command?.client_operation_id || !command?.payload_hash || !receiptId) {
    throw new Error('Comando offline ou identificador de receipt inválido.');
  }
  if (!['accepted', 'already_accepted', 'conflict', 'rejected_permanent'].includes(result?.status)) {
    throw new Error('Resultado de sync não final; outbox preservada.');
  }
  const receiptValue = {
    schema_version: 1,
    command_identity: {
      client_operation_id: command.client_operation_id,
      flight_id: command.flight_id,
      local_sequence: command.local_sequence,
      payload_hash: command.payload_hash,
    },
    server_result: structuredClone(result),
    received_at_local: new Date().toISOString(),
  };
  const entries = [{ storeName: 'sync_receipts', id: receiptId, value: receiptValue, localRevision: 1 }];
  if (result.status === 'conflict') {
    entries.push({
      storeName: 'conflicts',
      id: receiptId,
      value: { ...receiptValue, conflict: result.conflict || null },
      localRevision: 1,
    });
  }

  await vault.putJsonBatch(entries);
  const stored = await vault.getJson('sync_receipts', receiptId);
  if (!stored ||
      stored.value?.command_identity?.client_operation_id !== command.client_operation_id ||
      stored.value?.command_identity?.payload_hash !== command.payload_hash) {
    throw new Error('Receipt do servidor não foi confirmado no armazenamento local.');
  }

  // The draft may fail to persist (quota, interrupted IDB transaction, etc.).
  // Retain the exact operation in outbox so the next retry gets an
  // already_accepted response instead of silently losing acknowledgement.
  if (result.status === 'accepted' || result.status === 'already_accepted') {
    await markAccepted(command, result);
  }
  await vault.deleteJson('outbox', outboxRecord.id);
}
