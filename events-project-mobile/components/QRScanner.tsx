import React, { useRef, useState } from 'react';
import { View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Button, Label } from './ui';
export function QRScanner({ onCode }: { onCode: (code: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const scanned = useRef(false);
  async function start() {
    setBusy(true); setError(null);
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) { scanned.current = false; setOpen(true); }
      else setError('O acesso à câmera foi negado. Você pode digitar o código do participante abaixo.');
    } catch { setError('Não foi possível abrir a câmera. Tente novamente ou digite o código abaixo.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}><Button title={open ? 'Fechar câmera' : 'Escanear QR do participante'} secondary busy={busy} onPress={() => open ? setOpen(false) : void start()} />{error && <Label muted>{error}</Label>}{permission && !permission.granted && !permission.canAskAgain && <Label muted>Permita o acesso à câmera nas configurações do dispositivo ou digite o código abaixo.</Label>}{open && <View style={{ height: 280, borderRadius: 18, overflow: 'hidden' }}><CameraView facing="back" style={{ flex: 1 }} barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={({ data }) => { if (scanned.current) return; scanned.current = true; setOpen(false); onCode(data); }} /></View>}</View>;
}
