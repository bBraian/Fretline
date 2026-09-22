import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/theme.css'
import { App } from './App'
import { installAssetBase } from './render/assetBase'

// Antes de qualquer modelo ser pedido: é um gancho no carregador do three,
// e instalá-lo depois deixaria os primeiros pedidos passarem direto.
installAssetBase()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
