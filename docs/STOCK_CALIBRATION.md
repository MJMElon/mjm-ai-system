# Stock Calibration（库存校正 / Amendment）目前的全部逻辑

> 这份是办公室自己看的整理版，写在 2026-10-07，照当时 code 的实际行为写的。
> 工程上的坑记在 `CLAUDE.md`，这里只讲「它现在是怎么算的」。
>
> *This file is the office's own reference for how Stock Calibration behaves
> today. The engineering notes stay in CLAUDE.md.*

代码位置：`operation/operation_batch_detail.html` → Tab 7「Adjustments & Audit」。
另外三个地方会读同一批记录：`shared/shared_plot_movement.js`（维护工的计件数量）、
`operation/operation_reports.html`（Movement Report、Life of Seedlings、
Transplanting Report）。

---

## 1. 一笔调整存什么

全部存在 `shared_inventory_logs`，`transaction_type = 'Stock_Calibration'`。

| 栏位 | 内容 |
|---|---|
| `quantity_change` | 差额，**可正可负**。正 = 多出来（Found），负 = 少了（Stolen / Dead / 数错） |
| `plot_name` | 哪一个 plot 或 tray |
| `transaction_date` | **事情发生那天**，不是你打单那天 |
| `remark` | 所有其他资料，用标签塞在一起 |
| `batch_name` | 哪一个 batch |

`remark` 的格式：

```
Report: <报表>. Plot: <plot>. [Tray: <tray>.] <原因>
        [TxTray:<tray>. TxMap:<url> TxRow:<id>]
        [APPROVED by <谁> on <时间>]
```

没有为这些资料开新的 column —— 全部是 remark 里的标签，由
`_parseCalibration()` **一个地方**解析。表格、每张报表的提示条、计算，读的
都是这一个函数的结果，所以它们不可能对同一行记录有不同的理解。

**表单上要填的：** 日期、数量(+/-)、Report、Plot/Tray、原因（全部必填）。

---

## 2. 规则 A — 性质由「登记在哪张报表」决定，不是人选的

| 登记在 | 意思 | 结果 |
|---|---|---|
| **Seeds Received / Planting / Seed Audit** | 根本就没有那么多 | batch **总数变**，所有报表的基数跟着变 |
| **Transplanting / 1st / 2nd / 3rd Culling** | 本来有，也到了，之后才没的（偷、死、地上数错） | **总数不变**，变的是那个 plot 现在站着多少 |

代码：`ADJUST_SIDE_OF(report)`，前三个叫 `seed` 侧，后四个叫 `plot` 侧。

**这是算出来的，不是存起来的。** 以前表单有问过这一题（存成 remark 里的
`Side:`），现在那个标签被忽略 —— 当时填错边的旧记录会自己修正。

**为什么要这样分：** batch 234 读成 over allocated 53，就是因为 B14 被偷
走的 53 棵被当成「总数变少」从总数扣掉，但 transplant 记录还把它们算进
B14 —— 一边减一边没减。现在登记在 Transplanting 就不可能发生。

---

## 3. 规则 B — 一笔调整算到哪几张报表

| 登记在 | 会动的报表 |
|---|---|
| **Transplanting** | Transplanting + 2nd Culling + 3rd Culling |
| **1st Culling** | 只有 1st Culling |
| **2nd Culling** | 只有 2nd Culling |
| **3rd Culling** | 只有 3rd Culling |

代码：`ADJUST_APPLIES_TO`。

**为什么 Transplanting 会传下去：** 它不是「点数」，是「送出去多少」。两个
culling 都还拿它当基数。1st Culling 不碰 —— 1st culling 发生在 tray 里面，
这些苗根本还没出去。

**为什么每个 culling 自己留着、不传下去：** culling 本身就是重新点一次
（人点一次，drone 再点一次）。之前调掉的本来就不在那个新数字里了，再扣一次
等于扣两次。

235 的 N11 就是这样来的：2nd cull 调掉 1 棵，3rd cull 又扣一次，
那一行读 76 对着 drone map 的 77 —— 其实有 77 棵可以 cull。

---

## 4. 规则 C — 要 approve 才会动数字

- **没批**：报表上面那条提示条用琥珀色写「Awaiting approval」，
  **一个数字都不动**，全系统都一样。
- **批了**：remark 尾巴加 `[APPROVED by <谁> on <时间>]`，这一刻起才算数。

读这个标记的地方（四个，规则一致）：
`operation_batch_detail.html` 的 `syncAdjustmentBars()`、
`shared_plot_movement.js`、Movement Report、Life of Seedlings。

---

## 5. 规则 D — 改一笔已经批过的，会退回 pending

按 Edit 改一笔已 approve 的记录，存回去的时候 remark 是**从表单重建的**，
approve 标记不会带过去 → 自动变回 pending，要重新批。

签过名的数字，不会在没人再签一次的情况下变成别的。

同样的道理：编辑的时候把它**拆成几个 tray**，那一行会变成第一个 tray 的
份额、其余插在旁边，而且**每一行都从 pending 开始**。

---

## 6. 规则 E — Transplanting 的调整按 tray 拆

选 Report = Transplanting + 一个 plot，表单会自动读回所有送苗进这个 plot
的 Transplanted 记录，列出每一个 tray 送了多少。

- 你**逐个 tray** key 差额，上面的 Qty 变成只读的合计。
- 存成 **一个 tray 一行**（`Tray: <名字>.` 在 remark 里），各自能批、能改、
  能单独读。
- plot 的总数是它们的和 —— 这只是把记录拆开，**算法完全没变**。
- 只有 Transplanting 有这个 —— 它是唯一一张「一个 plot 的数字由好几个 tray
  凑出来」的报表。
- 编辑一笔已存的、把 tray 栏填上，那几个 tray 的数字**必须加起来等于**正在
  改的那个数量，不然存不下去。

Tab 3 的已存清单上，每一行会画出 `Qty · Adjustment · Final`。

---

## 7. 规则 F — 一个从来没有 transplant 记录的 plot

如果调整是**加**进一个从来没有 transplant 记录的 plot，表单会多问两样
（两样都必填）：

1. 这些苗从**哪个 tray** 出来
2. **drone map**（照片）

Map 在**按存的时候**就上传，不是批的时候 —— 中间很可能 reload 过，暂存的
档案活不过去。（代价是：永远没被批的调整会留下一个没用的档案。）

**Approve 的时候**才写一条 `Transplanted` 记录，而且 **quantity_change = 0**：

```
Qty 0   ·   Adjustment +140   ·   Final 140
```

**为什么是 0：** 没有人 key 过这个 transplant —— 这正是它本来没记录的原因。
写 140 进去等于说有人记录过，然后调整再加一次 → 变成 280。数字留在调整里，
这一行只是「它现在落在哪里」。

`TxRow:<id>` 记在调整的 remark 里当作连结，不会建第二条。

**配套的两个按钮（都只有 admin 看得到）：**

- **Add `<plot>`'s row** —— 在 Transplanting 清单下面。如果那一行被删掉了
  （以前存 Transplanting tab 会删掉它），按这个用调整上已经有的 tray 和 map
  重写一次，什么都不用再问。
- **Fix Tray** —— 改一行的来源 tray，连它背后那笔调整一起改。

---

## 8. 规则 G — 读不到就不说话

如果调整读不到（网路、权限），`syncAdjustmentBars()` 会**清空所有的 net、
隐藏所有提示条**，不会拿上一次读到的调整撑着这一次的基数。

基数明显短少，好过悄悄地对而没人知道为什么。

---

## 9. 每一张报表实际怎么用这个数字

### Tab 1 Seeds Received / Tab 8 Seed Audit / Tab 2 Planting
只有上面那条提示条。数字经由 `adjustNetTotal()` 进 Tab 3 和 Tab 4 的基数。

### Tab 3 Transplanting
```
分配基数 = 已种总数 + D-Tone + (所有批过的 seed 侧调整) + Transplanting 的 plot 侧损失
实际站着 = 主 plot 总数 + Transplanting 的 plot 侧损失
```
plot 侧的损失**两边同时减**，所以不会变成 over-allocated。
已存清单每一行画 `Qty · Adjustment · Final`，是**画上去**的不是重画整个清单
（调整是在清单画完之后才读到的）。
合计下面会写：有调整、但找不到对应那一行的，是多少、在哪个 plot。

### Tab 4 1st Culling
```
tray 数量 = 记录的 tray 数量 + 这个 tray 的 1st Culling 调整   （下限 0）
cull rate = 已 cull / tray 数量
总数 = 已种 + D-Tone + (所有批过的 seed 侧调整)
```

### Tab 5 2nd Culling
每一行读 `adjustPlotLoss(plot, '2nd Culling')`，在行上用咖啡色写
「Adjustment +N / -N」。

### Tab 6 3rd Culling
```
Balance = 转入数量 - 2nd cull dead - 已卖 - 转出 + 这个 plot 的 3rd Culling 调整
```
（下限 0）。正的调整（多找到）同样方向处理。

**Drone map 面板的提示：** 如果这个 plot 的 drone map 和 3rd cull 差 N，而
这个 plot **还没批**的调整刚好加起来等于 N，面板会讲出来，并且给一个按钮
直接跳到那笔调整。**必须刚好相等** —— 差不多就是巧合，会教人不看就按。

### Movement Report（operation_reports.html）
有一个「Stock Adjustment」栏，只收**批过的**、而且 plot 是主 plot 的。
用它自己的正负号，不是绝对值。

### Life of Seedlings
`calibration` 这一项加总所有批过的调整；plot 属于 Pre-Nursery 的另外算一个
`calibrationPre`。

### 维护工的计件数量（shared_plot_movement.js）
plot 的 live count 会把批过的调整算进去（正负照原样）。
**注意：这里不分 seed 侧 / plot 侧 —— 只要批过就算。**

---

## 10. 谁能做什么

| 动作 | 谁 |
|---|---|
| Key 一笔新的调整 | 任何能开这一页的人 |
| Edit / Del / Approve | **只有 operation admin** |
| Add `<plot>`'s row / Fix Tray | **只有 operation admin** |

权限是在页面画出来**之前**读的 —— 以前是之后才读，所以一开页 Edit 和
Approve 按钮会不见，要存一次东西才出现。

---

## 11. 哪里看得到

- **Tab 7** —— Adjustment History 表格，加上三个合计卡（Net / Total Added /
  Total Removed），还有 key 的表单。
- **每一张报表 tab 上面的提示条** —— 列出针对它的调整：数量、plot、tray、
  日期、原因、批没批。全部批完是绿色，还有没批的是琥珀色。**没有调整就整条
  隐藏**（干净的报表不会显示一句没人要的「一切正常」）。
  提示条是**只读**的，只能在 Tab 7 key 和批 —— 两个地方 key 同一件事，
  就是它们开始互相矛盾的时候。

---

## 12. 已知的不干净的地方

写出来是因为「重新整理」要动的话，这几条是候选：

1. **`adjustNetFor(report)` 没有人叫。** 每张报表各自的 net 有算出来，但只有
   提示条在用；真正进基数的是 `adjustNetTotal()`（全部加起来）。
2. **维护工的计件数量不分 seed / plot 侧** —— 只看有没有批过。一笔登记在
   Seeds Received、但 plot 选了主 plot 的调整，会动到计件的数量。
3. **Life of Seedlings 还在读 remark 里旧的 `Side:`**（找不到就当 seed）。
   Tab 7 已经不看这个标签了。目前只影响它明细里显示的一个字，不影响金额。
4. **`ADJUST_APPLIES_TO` 没有 `seeds received` / `planting` / `seed audit`。**
   seed 侧是走另一条路（`ADJUST_NET` → `adjustNetTotal`），所以两种性质的
   「算到哪里」是分开写在两个地方的。
5. **一笔 Transplanting 的调整，如果 plot + tray 配不到任何一行**，会被算进
   合计但不在任何一行上，只在合计下面用一句话写出来。
