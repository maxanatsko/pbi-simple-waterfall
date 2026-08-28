import powerbi from "powerbi-visuals-api";
import VisualUpdateOptions = powerbi.extensibility.visual.VisualUpdateOptions;
import IVisualHost = powerbi.extensibility.visual.IVisualHost;
import DataView = powerbi.DataView;
import DataViewMatrix = powerbi.DataViewMatrix;
import ISelectionId = powerbi.visuals.ISelectionId;
import { ValueFormatter, resolveFormat } from "./valueFormatting";

/**
 * Returns the first dataView with its `matrix` proven non-null. Every data
 * converter needs the matrix; `update()` runs inside a try/catch that reports
 * `renderingFailed`, so throwing here is the intended "no data" path.
 */
export function requireMatrixDataView(options: VisualUpdateOptions): DataView & { matrix: DataViewMatrix } {
    const dataView = options && options.dataViews && options.dataViews[0];
    if (!dataView || !dataView.matrix) {
        throw new Error("Multi-Step Waterfall: a matrix dataView is required.");
    }
    return dataView as DataView & { matrix: DataViewMatrix };
}

/** Flatten the matrix to per-measure arrays of leaf nodes
 *  ({ value, numberFormat, category, displayName, selectionId }), one array per
 *  value source, with a `|`-joined category path and a parent-chain selection id. */
export function findLowestLevels(
    dataView: DataView & { matrix: DataViewMatrix },
    host: IVisualHost,
    fmt: ValueFormatter,
): any[] {

    function getChildLevel(currentNode: any, parentText: string, indexMeasures: any, rootnode: boolean) {

        if (currentNode.children.length != undefined) {
            currentNode.children.forEach((child: any) => {
                if (rootnode) {
                    parentNodes.length = 0;
                }
                var format = dataView.matrix.rows.levels[child.level].sources[0].format;
                var type = dataView.matrix.rows.levels[child.level].sources[0].type;
                if (child.children != undefined) {
                    childrenCount = childrenCount + 1

                    parentNodes.push(child);
                    getChildLevel(child, parentText + "|" + fmt.category(child.value, type, format), indexMeasures, false);
                } else {

                    var node: any = [];
                    node["value"] = child.values[indexMeasures].value;
                    node["numberFormat"] = resolveFormat(child.values[indexMeasures], dataView.matrix.valueSources[indexMeasures].format);
                    node["category"] = (parentText + "|" + fmt.category(child.value, type, format)).replace("null", "(blank)");
                    if (child.value == null) {
                        node["displayName"] = "(blank)";
                    } else {
                        node["displayName"] = fmt.category(child.value, type, format);
                    }

                    var selectionbuilder = host.createSelectionIdBuilder();
                    var selectionnode: any = host.createSelectionIdBuilder();
                    if (parentNodes.length > 0) {
                        parentNodes.forEach(nodes => {
                            selectionnode = selectionbuilder.withMatrixNode(nodes, rows.levels)
                        });
                    } else {
                        selectionnode = host.createSelectionIdBuilder();
                    }
                    var selectionId: ISelectionId = selectionnode.withMatrixNode(child, rows.levels).createSelectionId();
                    node["selectionId"] = selectionId;
                    nodes.push(node);

                }
            });
        }
    }
    var rows = dataView.matrix.rows;
    var root = rows.root;
    var allNodes: any[] = [];
    var childrenCount = 0;
    var parentNodes: any[] = [];
    for (let indexMeasures = 0; indexMeasures < dataView.matrix.valueSources.length; indexMeasures++) {
        var nodes: any[] = [];
        getChildLevel(root, "", indexMeasures, true);
        allNodes.push(nodes);
    }
    return allNodes;
}

/** Return the matrix row nodes at level `level`, each carrying `childrenCount`,
 *  `category`, `displayName` and a `selectionId` (used to build the extra
 *  category axes above the leaf axis). */
export function getMatrixLevelsAt(
    root: any,
    level: number,
    dataView: DataView & { matrix: DataViewMatrix },
    host: IVisualHost,
    fmt: ValueFormatter,
    measureCount: number = dataView.matrix.valueSources.length,
): any[] {

    function getChildLevel(currentNode: any, parentText: string) {
        if (currentNode.children.length != undefined) {

            currentNode.children.forEach((child: any) => {
                if (index == level) {
                    mainNode.push(createNode(child));
                } else {

                    index = index + 1;
                    if (child.children != undefined) {

                        getChildLevel(child, parentText + "|" + child.value);
                    }
                    index = index - 1;
                }

            });

        }

    }
    function createNode(child: any) {
        var node: any = [];
        if (child.children == undefined) {
            for (let indexMeasures = 0; indexMeasures < measureCount; indexMeasures++) {
                var nodeValue: any[] = [];
                nodeValue = child.values[indexMeasures].value;
                node.push(nodeValue);
            }
        } else {
            counter = 0;
            countChildrens(child);
            node["childrenCount"] = counter;

        }
        var format = dataView.matrix.rows.levels[level].sources[0].format;
        var type = dataView.matrix.rows.levels[level].sources[0].type;
        if (child.value == null) {
            node["category"] = "(blank)";
            node["displayName"] = "(blank)";
        } else {
            node["category"] = fmt.category(child.value, type, format);
            node["displayName"] = fmt.category(child.value, type, format);
        }

        var selectionId: ISelectionId = host.createSelectionIdBuilder()
            .withMatrixNode(child, rows.levels)
            .createSelectionId();
        node["selectionId"] = selectionId;
        return node;
    }
    function countChildrens(child: any) {
        if (child.children == undefined) {
            counter = counter + 1;
        } else {
            child.children.forEach((element: any) => {
                countChildrens(element)
            });
        }

    }
    var counter = 0;
    var index = 0;
    var mainNode: any[] = [];
    var rows = dataView.matrix.rows;
    getChildLevel(root, "");
    return mainNode;
}
