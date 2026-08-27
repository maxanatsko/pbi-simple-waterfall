import powerbi from "powerbi-visuals-api";
import ISelectionId = powerbi.visuals.ISelectionId;
import ISelectionIdBase = powerbi.extensibility.ISelectionId;
import ISelectionManager = powerbi.extensibility.ISelectionManager;
import * as d3 from "d3";

type Selection = d3.Selection<any, any, any, any>;

/** Selection, keyboard navigation and high-contrast strokes for the bar series.
 *  Built once in the Visual constructor (stable host services); `configure()`
 *  refreshes the per-render flags. */
export class BarInteractions {
    private allowInteractions = false;
    private isHighContrast = false;

    constructor(private readonly deps: {
        selectionManager: ISelectionManager;
        colorPalette: powerbi.extensibility.ISandboxExtendedColorPalette;
    }) {}

    public configure(state: { allowInteractions: boolean; isHighContrast: boolean }): void {
        this.allowInteractions = state.allowInteractions;
        this.isHighContrast = state.isHighContrast;
    }

    private get hcForeground(): string {
        return this.deps.colorPalette.foreground.value;
    }
    private get hcBackground(): string {
        return this.deps.colorPalette.background.value;
    }

    /** Right-click context menu on the plot. */
    public wireContextMenu(svg: Selection): void {
        svg.on('contextmenu', (event: MouseEvent) => {
            const mouseEvent: MouseEvent = event;
            const eventTarget: EventTarget | null = mouseEvent.target;
            let dataPoint: any = d3.select(<d3.BaseType>eventTarget).datum();
            this.deps.selectionManager.showContextMenu(dataPoint ? dataPoint.selectionId : {}, {
                x: mouseEvent.clientX,
                y: mouseEvent.clientY
            });
            mouseEvent.preventDefault();
        });
    }

    /** Click-to-select on a d3 selection (bars or axis labels); `getBars`
     *  yields the bar series whose opacity reflects selection. */
    public wireClick(selection: Selection, getBars: () => Selection): void {
        selection.on('click', (event: MouseEvent, d: any) => {
            // Allow selection only if the visual is rendered in a view that supports interactivity (e.g. Report)
            if (this.allowInteractions) {
                const isCtrlPressed: boolean = event.ctrlKey;
                if (this.deps.selectionManager.hasSelection() && !isCtrlPressed) {
                    getBars().attr('fill-opacity', 1);
                }
                this.deps.selectionManager
                    .select(d.selectionId, isCtrlPressed)
                    .then((ids: ISelectionIdBase[]) => {
                        this.syncSelectionState(getBars(), ids);
                    });
                event.stopPropagation();
            }
        });
    }

    /** Clear selection when clicking the plot background. */
    public wireRootClear(svg: Selection, getBars: () => Selection): void {
        svg.on('click', () => {
            if (this.allowInteractions) {
                this.deps.selectionManager
                    .clear()
                    .then(() => {
                        this.deps.selectionManager.registerOnSelectCallback(
                            (ids: ISelectionIdBase[]) => {
                                this.syncSelectionState(getBars(), ids);
                            });
                    });
            }
            getBars().attr('fill-opacity', 1);
        });
    }

    /** Re-apply the current selection to a freshly drawn bar series. */
    public resyncOnRedraw(bars: any): void {
        this.syncSelectionState(bars, this.deps.selectionManager.getSelectionIds() as ISelectionIdBase[]);
    }

    public syncSelectionState(bars: any, selectionIds: ISelectionIdBase[]): void {
        if (!bars) {
            return;
        }
        if (!selectionIds.length) {
            bars.attr("fill-opacity", null);
            if (this.isHighContrast) {
                bars.attr('stroke', this.hcForeground).attr('stroke-width', 2);
            }
            return;
        }
        bars.each((d: any, i: number, nodes: any) => {
            const isSelected: boolean = this.isSelectionIdInArray(selectionIds, d.selectionId);
            d3.select(nodes[i]).attr('fill-opacity', isSelected
                ? 1
                : 0.5
            );
            if (this.isHighContrast) {
                d3.select(nodes[i])
                    .attr('stroke', isSelected ? this.deps.colorPalette.foregroundSelected.value : this.hcForeground)
                    .attr('stroke-width', isSelected ? 3 : 1);
            }
        });
    }

    public applyAccessibility(bars: d3.Selection<any, any, any, any>): void {
        if (!bars) {
            return;
        }
        const self = this;
        // Roving tab index: the whole bar series is one Tab stop. Only the
        // "current" bar is tabbable; Arrow / Home / End move focus and the 0
        // index with it.
        bars
            .attr('tabindex', (d: any, i: number) => (i === 0 ? 0 : -1))
            .attr('role', 'option')
            .attr('aria-label', (d: any) => {
                const name = d.category === "defaultBreakdownStepOther" ? (d.displayName || "Other") : d.category;
                const value = (d.toolTipValue1Formatted != null && d.toolTipValue1Formatted !== "")
                    ? d.toolTipValue1Formatted
                    : d.value;
                return `${name}: ${value}`;
            })
            .on('keydown', function (event: KeyboardEvent, d: any) {
                const nodes = bars.nodes();
                const i = nodes.indexOf(this);
                const focusAt = (target: number) => {
                    const clamped = Math.max(0, Math.min(target, nodes.length - 1));
                    const el = nodes[clamped] as SVGElement;
                    if (!el) {
                        return;
                    }
                    nodes.forEach((n, k) => (n as SVGElement).setAttribute('tabindex', k === clamped ? '0' : '-1'));
                    el.focus();
                };
                switch (event.key) {
                    case 'Enter':
                    case ' ':
                    case 'Spacebar':
                        event.preventDefault();
                        if (!self.allowInteractions) {
                            return;
                        }
                        self.deps.selectionManager
                            .select(d.selectionId, event.ctrlKey || event.metaKey || event.shiftKey)
                            .then((ids: ISelectionIdBase[]) => self.syncSelectionState(bars, ids));
                        break;
                    case 'ArrowRight':
                    case 'ArrowDown':
                        event.preventDefault();
                        focusAt(i + 1);
                        break;
                    case 'ArrowLeft':
                    case 'ArrowUp':
                        event.preventDefault();
                        focusAt(i - 1);
                        break;
                    case 'Home':
                        event.preventDefault();
                        focusAt(0);
                        break;
                    case 'End':
                        event.preventDefault();
                        focusAt(nodes.length - 1);
                        break;
                    case 'Escape':
                        if (self.allowInteractions) {
                            self.deps.selectionManager.clear().then(() => self.syncSelectionState(bars, []));
                        }
                        break;
                    default:
                        break;
                }
            });
    }

    private isSelectionIdInArray(selectionIds: ISelectionIdBase[], selectionId: ISelectionIdBase): boolean {
        if (!selectionIds || !selectionId) {
            return false;
        }
        return selectionIds.some((currentSelectionId) => {
            return (currentSelectionId as ISelectionId).includes(selectionId as ISelectionId);
        });
    }
}
