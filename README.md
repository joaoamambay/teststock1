# StockControl — Sistema de Controlo de Estoque (Google Sheets)

Dashboard de gestão de estoque (frontend HTML/CSS/JS puro) ligado a uma
Google Sheet através de uma API feita em Google Apps Script.

## Ficheiros

| Ficheiro | Onde vai |
|---|---|
| `index.html` | Hospedar onde preferir (GitHub Pages, servidor próprio, ou abrir localmente) |
| `style.css` | Junto ao `index.html` |
| `script.js` | Junto ao `index.html` |
| `Code.gs` | Colar no editor do Google Apps Script, dentro da Google Sheet |

## 1. Layout da Google Sheet

Crie uma Google Sheet nova, renomeie a primeira aba para **`Produtos`** e
insira este cabeçalho exato na linha 1 (o script cria isto automaticamente
se a aba não existir, mas confirme que fica assim):

| Coluna | A | B | C | D | E | F | G | H | I |
|---|---|---|---|---|---|---|---|---|---|
| **Cabeçalho** | ID | Nome | Categoria | Local | Qtd Atual | Qtd Minima | Unidade | Status | Ultima Atualizacao |
| Exemplo | P1723 | Leite Meio Gordo 1L | Laticínios | Frigorífico | 4 | 6 | un | Nível Crítico | 15/08/2026 10:32 |
| Exemplo | P1724 | Peito de Frango | Carnes | Arca | 0 | 3 | kg | Comprar Já! | 15/08/2026 09:10 |
| Exemplo | P1725 | Arroz Agulha 1kg | Secos | Armário | 12 | 4 | un | Estoque Normal | 14/08/2026 18:00 |

A coluna **Status** é recalculada automaticamente pelo `Code.gs` sempre que
os dados são lidos ou alterados — não precisa de a preencher à mão.

Uma segunda aba **`Movimentos`** é criada automaticamente na primeira
entrada/saída registada, com o histórico: Data, Produto ID, Tipo,
Quantidade, Nota.

## 2. Publicar a API (Google Apps Script)

1. Na Sheet, vá a **Extensões > Apps Script**.
2. Apague o conteúdo do editor e cole o conteúdo de `Code.gs`.
3. Clique em **Implementar > Nova implementação**.
4. Tipo: **Aplicativo da Web**. Executar como: **Eu**. Quem pode aceder:
   **Qualquer pessoa**.
5. Autorize as permissões pedidas (é o seu próprio script a aceder à sua
   própria Sheet).
6. Copie o URL gerado — termina em `/exec`.

## 3. Ligar o frontend

Abra `script.js` e substitua a linha:

```js
const CONFIG = {
  API_URL: 'https://script.google.com/macros/s/SEU_ID_DE_IMPLEMENTACAO_AQUI/exec'
};
```

pelo URL copiado no passo anterior. Depois é só abrir `index.html` num
browser (ou hospedar os 3 ficheiros num servidor estático).

> **Nota:** sempre que editar `Code.gs`, tem de criar uma **nova
> implementação** (ou gerir implementações existentes) para as alterações
> ficarem ativas no URL publicado.

## 4. Importação em massa (vários produtos de uma vez)

Na view **Produtos**, o botão **"⇩ Importar CSV"** abre um modal onde pode:

1. **Colar** várias linhas diretamente (uma por produto), ou
2. **Carregar um ficheiro `.csv`** (o botão "Descarregar modelo CSV" gera um
   ficheiro de exemplo já com o formato certo para preencher no Excel/Google
   Sheets e depois voltar a carregar aqui).

Formato de cada linha (separado por vírgulas):

```
Nome, Categoria, Local, Qtd Atual, Qtd Minima, Unidade
```

Exemplo:

```
Leite Meio Gordo 1L, Laticínios, Frigorífico, 4, 6, un
Peito de Frango, Carnes, Arca, 0, 3, kg
Arroz Agulha 1kg, Secos, Armário, 12, 4, un
```

Depois de colar/carregar, clique em **"Analisar"** para ver uma
pré-visualização: linhas válidas ficam a verde, linhas com **Nome**,
**Categoria** ou **Local** em falta ficam marcadas a vermelho e não são
importadas. Só depois clique em **"Importar Produtos"**.

No backend, isto chama a ação `bulkCreate` do `Code.gs`, que escreve todas
as linhas na Sheet numa única operação — muito mais rápido do que criar os
produtos um a um.

## 5. Regras de status (podem ser ajustadas em `computeStatus_` e `computeStatus`)

- 🟢 **Estoque Normal** — quantidade atual acima da mínima ideal.
- 🟠 **Nível Crítico** — quantidade atual igual ou abaixo da mínima, mas
  ainda acima de 50% dela.
- 🔴 **Comprar Já!** — quantidade esgotada (0) ou abaixo de 50% da mínima.

Esta regra existe em **dois lugares** (frontend `script.js` e backend
`Code.gs`) para que o dashboard mostre sempre um status correto mesmo antes
de recarregar os dados — mantenha-os sincronizados se decidir alterar a
lógica.
