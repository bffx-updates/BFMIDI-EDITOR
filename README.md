# BFMIDI Editor Externo

Editor web externo para o BFMIDI com conexao via USB (WebMIDI + Web Serial).
As paginas `main`, `preset-config`, `global-config` e `system` sao geradas diretamente dos mesmos blocos HTML/CSS/JS do firmware para manter paridade visual e estrutural.

## Requisitos

- Google Chrome ou Microsoft Edge (desktop)
- Firmware com `USB_EDITOR.h` integrado
- Cabo USB de dados

## Como usar

1. Abra `index.html` em um servidor local (ou hospedagem estatica).
2. Conecte o BFMIDI no USB.
3. Clique em **Conectar** na barra superior.
4. Permita acesso MIDI e Serial quando solicitado.
5. O editor abre direto na tela **Main** dentro do iframe.
6. Navegue normalmente pelas telas do firmware:
   - **Main**: `/main/`
   - **Presets**: `/preset-config/`
   - **Globals**: `/global-config/`
   - **System**: `/system/`

## Instalar como PWA

1. Abra no Chrome/Edge.
2. Use o menu do navegador e escolha **Instalar app**.
3. Apos o primeiro carregamento, os assets ficam em cache para uso offline.

## Troubleshooting

- **Web Serial nao aparece**: confirme Chrome/Edge desktop e HTTPS/localhost.
- **Conexao falha no MIDI**: continue, pois o app tenta fallback para serial.
- **Ping sem resposta**: coloque o BFMIDI em modo editor enviando SysEx novamente ou reconecte.
- **Sem permissao USB**: remova permissoes do site no navegador e reconecte.
- **Tela abre sem dados**: clique em **Conectar** na barra superior; as paginas de paridade dependem do bridge em `window.parent`.
