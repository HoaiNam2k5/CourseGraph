import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowLeft, ArrowRight, Focus, Minus, Network as NetworkIcon, Plus } from 'lucide-react';
import { Network } from 'vis-network';
import { foldSearchText } from '../../../../packages/shared/src/search.js';
import { useResource } from '../api.js';
import { Empty, ErrorNotice, Loading } from '../components/common.js';
import { GraphDetailSheet, useMobileGraph } from '../components/GraphDetailSheet.js';
import SearchField from '../components/SearchField.js';
import { formatNumber } from '../types.js';
import {
  drawOverview, drawRecords, indexNetwork, networkCategories, otherEndpoint, recordKey,
  type NetworkLink, type NetworkRecord, type NetworkSnapshot, type NetworkView,
} from './network-model.js';
import './network-explorer.css';

const initialEdges = 12;
const listStep = 12;
const noLinks: NetworkLink[] = [];
const collator = new Intl.Collator('vi', { numeric: true });

type ExplorerProps = {
  view: NetworkView;
  onViewChange: (view: NetworkView) => void;
};

export default function NetworkExplorer(props: ExplorerProps) {
  const network = useResource<NetworkSnapshot>('/network');
  const moveFocus = useRef(false);
  function changeGroup(view: NetworkView, keyboard: boolean) {
    moveFocus.current = keyboard;
    props.onViewChange(view);
  }

  if (network.error) return <ErrorNotice message={network.error} retry={network.reload} />;
  if (network.loading || !network.data) return <Loading text="Đang mở mạng lưới…" />;
  if (!network.data.nodes.length) return <div className="panel"><Empty title="Mạng lưới chưa có dữ liệu" description="Các bản ghi đào tạo sẽ xuất hiện ở đây." /></div>;
  return <ExplorerContent key={props.view} view={props.view} changeGroup={changeGroup} moveFocus={moveFocus} snapshot={network.data} />;
}

function ExplorerContent({ view, changeGroup, moveFocus, snapshot }: {
  view: NetworkView;
  changeGroup: (view: NetworkView, keyboard: boolean) => void;
  moveFocus: { current: boolean };
  snapshot: NetworkSnapshot;
}) {
  const model = useMemo(() => indexNetwork(snapshot), [snapshot]);
  const inspector = useRef<HTMLElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const detailTrigger = useRef<HTMLButtonElement>(null);
  const mobile = useMobileGraph();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [root, setRoot] = useState('');
  const [selected, setSelected] = useState('');
  const [visible, setVisible] = useState<Set<string>>(() => new Set());
  const [pageSize, setPageSize] = useState(listStep);
  const search = foldSearchText(query);
  const matches = useMemo(() => {
    return snapshot.nodes
      .filter((record) => (view === 'all' || record.label === view) && foldSearchText(`${record.id} ${record.name}`).includes(search))
      .sort((a, b) => collator.compare(a.name, b.name) || collator.compare(a.id, b.id));
  }, [search, snapshot.nodes, view]);

  const overview = view === 'all' && !root;
  const groupsListed = overview && !search;
  const focus = search ? undefined : model.records.get(selected);
  const incidentLinks = model.incidents.get(selected) ?? noLinks;
  const remainingLinks = incidentLinks.filter((link) => !visible.has(link.id));
  const drawing = useMemo(() => overview ? drawOverview(model) : drawRecords(model, root, matches.slice(0, 6), visible), [matches, model, overview, root, visible]);

  useEffect(() => {
    if (moveFocus.current) {
      moveFocus.current = false;
      searchField.current?.focus({ preventScroll: true });
    }
  }, [moveFocus]);

  useEffect(() => {
    const panel = inspector.current;
    if (selected && panel && !mobile) {
      panel.scrollTop = 0;
      panel.querySelector('h2')?.focus({ preventScroll: true });
    }
  }, [selected, mobile]);

  function openRecord(key: string) {
    setRoot(key);
    setSelected(key);
    setDetailsOpen(mobile);
    setQuery('');
    setPageSize(listStep);
    setVisible(new Set((model.incidents.get(key) ?? []).slice(0, initialEdges).map((link) => link.id)));
  }

  function expandLinks() {
    setVisible((current) => new Set([...current, ...remainingLinks.slice(0, initialEdges).map((link) => link.id)]));
  }

  function follow(link: NetworkLink) {
    setVisible((current) => new Set([...current, link.id]));
    setSelected(otherEndpoint(link, selected));
  }

  function selectOnCanvas(key: string) {
    if (overview) {
      const category = networkCategories.find((item) => item.label === key);
      if (category && model.counts.get(category.label)) changeGroup(category.label, false);
    } else if (root) {
      setQuery('');
      setSelected(key);
      setDetailsOpen(mobile);
    } else {
      openRecord(key);
    }
  }

  function backToOverview(keyboard: boolean) {
    setRoot('');
    setSelected('');
    setDetailsOpen(false);
    setVisible(new Set());
    setQuery('');
    setPageSize(listStep);
    if (keyboard) searchField.current?.focus({ preventScroll: true });
  }

  const category = networkCategories.find((item) => item.label === view);
  const showMobileResults = mobile && Boolean(search);
  const backButton = root && <button className="button secondary small network-back" type="button"
    onClick={(event) => backToOverview(event.detail === 0)}><ArrowLeft size={16} />Quay lại tổng quan</button>;
  const recordsList = <>
    <h2>{search ? 'Kết quả tìm kiếm' : category?.title ?? 'Bản ghi'}</h2>
    <p className="network-count" aria-live="polite">{formatNumber(matches.length)} bản ghi</p>
    {matches.length ? <>
      <ul className="network-records">{matches.slice(0, pageSize).map((record) => <li key={recordKey(record)}>
        <button type="button" aria-label={`Xem ${record.name} · ${record.id}`} onClick={() => openRecord(recordKey(record))}>
          <span><strong>{record.name}</strong><small>{record.id}{view === 'all' ? ` · ${networkCategories.find((item) => item.label === record.label)?.title}` : ''}</small></span>
          <ArrowRight size={15} aria-hidden="true" />
        </button>
      </li>)}</ul>
      {pageSize < matches.length && <button className="button secondary small network-more" type="button"
        onClick={() => setPageSize((count) => count + listStep)}>Xem thêm bản ghi</button>}
    </> : <p className="muted">Không tìm thấy bản ghi phù hợp.</p>}
  </>;
  const recordDetails = focus && <RecordInspector
    key={selected}
    record={focus}
    related={incidentLinks}
    records={model.records}
    remainingLinks={remainingLinks.length}
    onExpand={expandLinks}
    onFollow={follow}
    onCenter={selected === root ? undefined : () => openRecord(selected)}
    focusHeading={mobile}
  />;
  return <section className="panel network-explorer" aria-label="Khám phá mạng lưới">
    <header className="network-searchbar">
      <SearchField inputRef={searchField} label="Tìm trong mạng lưới" value={query}
        onQueryChange={(value) => { setQuery(value); setPageSize(listStep); }} />
    </header>
    {showMobileResults && <section className="network-inspector network-mobile-results" aria-label="Kết quả tìm kiếm">
      {recordsList}
      {backButton}
    </section>}
    <div className="network-workbench">
      <NetworkCanvas drawing={drawing} selected={selected} onPick={selectOnCanvas} />
      {!showMobileResults && <aside ref={inspector} className="network-inspector" aria-label="Chi tiết mạng lưới">
        {backButton}
        {groupsListed ? <>
          <h2>Nhóm dữ liệu</h2>
          <ul className="network-records">{networkCategories.map(({ label, title, color }) => {
            const count = model.counts.get(label) ?? 0;
            return <li key={label}>
              <button type="button" aria-label={`Xem mạng lưới ${title}`} disabled={!count} onClick={(event) => changeGroup(label, event.detail === 0)}>
                <i className="network-swatch" style={{ backgroundColor: color.stroke }} aria-hidden="true" />
                <span><strong>{title}</strong><small>{formatNumber(count)} bản ghi</small></span>
                <ArrowRight size={15} aria-hidden="true" />
              </button>
            </li>;
          })}</ul>
        </> : focus ? mobile ? <div className="network-detail-preview">
          <span><strong>{focus.name}</strong><small>{focus.id} · {formatNumber(incidentLinks.length)} liên kết</small></span>
          <button ref={detailTrigger} type="button" className="button secondary small" onClick={() => setDetailsOpen(true)}>Xem chi tiết nút</button>
        </div> : recordDetails : recordsList}
      </aside>}
    </div>
    {mobile && detailsOpen && focus && <GraphDetailSheet title="Chi tiết nút" returnFocus={detailTrigger} onClose={() => setDetailsOpen(false)}>
      {recordDetails}
    </GraphDetailSheet>}
    <div className="graph-footer">
      <span>{overview
        ? `${formatNumber(model.records.size)} bản ghi · ${formatNumber(model.linksById.size)} liên kết`
        : `${formatNumber(drawing.nodes.length)} nút · ${formatNumber(drawing.edges.length)} liên kết đang hiện`}</span>
      <span>{overview ? 'Số trên mũi tên là tổng liên kết theo chiều giữa hai nhóm.' : 'Chọn nút để xem loại và chiều liên kết.'}</span>
    </div>
  </section>;
}

function RecordInspector({ record, related, records, remainingLinks, onExpand, onFollow, onCenter, focusHeading }: {
  record: NetworkRecord;
  related: NetworkLink[];
  records: Map<string, NetworkRecord>;
  remainingLinks: number;
  onExpand: () => void;
  onFollow: (link: NetworkLink) => void;
  onCenter?: () => void;
  focusHeading: boolean;
}) {
  const [limit, setLimit] = useState(listStep);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus({ preventScroll: true });
  }, [focusHeading]);
  const key = recordKey(record);
  return <>
    <p className="network-record-meta">{networkCategories.find((item) => item.label === record.label)?.title} · {record.id}</p>
    <h2 ref={heading} tabIndex={-1}>{record.name}</h2>
    {onCenter && <button className="button secondary small" type="button" onClick={onCenter}><Focus size={15} />Đặt làm trung tâm</button>}
    <div className="network-incident-title"><h3>Liên kết trực tiếp</h3><span className="network-count">{formatNumber(related.length)}</span></div>
    {remainingLinks > 0 && <button className="button secondary small network-expand" type="button" onClick={onExpand}><Plus size={15} />Mở rộng liên kết ({formatNumber(remainingLinks)})</button>}
    {related.length ? <>
      <ul className="network-records">{related.slice(0, limit).map((link) => {
        const peerKey = otherEndpoint(link, key);
        const peer = records.get(peerKey);
        if (!peer) return null;
        const incoming = link.to === key;
        const direction = incoming ? 'Liên kết đến' : 'Liên kết đi';
        return <li key={link.id}>
          <button type="button" aria-label={`Xem ${peer.name} · ${peer.id} · ${link.title} · ${direction}`} onClick={() => onFollow(link)}>
            <span><strong>{peer.name}</strong><small>{peer.id} · {link.title}</small><small>{direction}</small></span>
            {incoming ? <ArrowDownRight className="network-incoming" size={15} aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />}
          </button>
        </li>;
      })}</ul>
      {limit < related.length && <button className="button secondary small network-more" type="button" onClick={() => setLimit((count) => count + listStep)}>Xem thêm liên kết</button>}
    </> : <p className="muted">Bản ghi này chưa có liên kết trực tiếp.</p>}
  </>;
}

function NetworkCanvas({ drawing, selected, onPick }: { drawing: ReturnType<typeof drawOverview>; selected: string; onPick: (key: string) => void }) {
  const viewport = useRef<HTMLDivElement>(null);
  const graph = useRef<Network | null>(null);
  const pick = useRef(onPick);

  useEffect(() => { pick.current = onPick; }, [onPick]);
  useEffect(() => {
    if (!viewport.current) return;
    const canvas = viewport.current;
    const instance = new Network(canvas, { nodes: [], edges: [] }, {
      physics: false,
      layout: { improvedLayout: false },
      nodes: { shape: 'box', borderWidth: 1, borderWidthSelected: 2, shapeProperties: { borderRadius: 10 }, chosen: false },
      edges: { arrows: 'to', color: '#72867f', width: 1.2, arrowStrikethrough: false, font: { color: '#39584e', size: 13, strokeColor: '#ffffff', strokeWidth: 4 }, selfReference: { size: 26, angle: Math.PI / 3 } },
      interaction: { hover: true, hoverConnectedEdges: false, multiselect: false, zoomView: false, dragNodes: false },
    });
    instance.on('selectNode', (event: { nodes: (string | number)[] }) => {
      const key = event.nodes[0];
      if (typeof key === 'string') pick.current(key);
    });
    const resize = new ResizeObserver(() => instance.fit({ animation: false }));
    resize.observe(canvas);
    graph.current = instance;
    return () => {
      resize.disconnect();
      instance.destroy();
      graph.current = null;
    };
  }, []);
  useEffect(() => {
    const instance = graph.current;
    if (!instance) return;
    instance.setData(drawing);
    instance.fit({ animation: false });
  }, [drawing]);
  useEffect(() => {
    const instance = graph.current;
    if (instance) instance.selectNodes(drawing.nodes.some((node) => node.id === selected) ? [selected] : []);
  }, [drawing, selected]);

  function zoom(factor: number) {
    const instance = graph.current;
    if (instance) instance.moveTo({ scale: Math.min(3, Math.max(0.08, instance.getScale() * factor)) });
  }

  return <div className="graph-stage network-stage">
    <div ref={viewport} className="graph-canvas" role="img" aria-label={`Sơ đồ ${formatNumber(drawing.nodes.length)} nút và ${formatNumber(drawing.edges.length)} đường nối`} />
    {!drawing.nodes.length && <div className="network-canvas-empty"><NetworkIcon size={26} aria-hidden="true" /><p>Chọn một nhóm hoặc thử từ khóa khác.</p></div>}
    <div className="network-zoom" aria-label="Điều khiển sơ đồ">
      <button className="icon-button" type="button" aria-label="Phóng to sơ đồ" onClick={() => zoom(1.2)}><Plus size={17} /></button>
      <button className="icon-button" type="button" aria-label="Thu nhỏ sơ đồ" onClick={() => zoom(1 / 1.2)}><Minus size={17} /></button>
      <button className="icon-button" type="button" aria-label="Đưa sơ đồ về vừa khung" onClick={() => graph.current?.fit({ animation: false })}><Focus size={17} /></button>
    </div>
  </div>;
}
