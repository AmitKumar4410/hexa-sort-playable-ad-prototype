import { BoxCollider, instantiate, Material, MeshRenderer, Node, Prefab, Vec3 } from 'cc';
import { HexStack } from './HexStack';
import { HexSpawnData } from '../data/LevelData';

export class GridCellFactory {
    private stackPrefab: Prefab | null = null;

    constructor(stackPrefab: Prefab) {
        this.stackPrefab = stackPrefab;
    }

    // create new stack node
    public createStack(): Node {
        if (!this.stackPrefab) {
            return new Node("EmptyStack");
        }
        return instantiate(this.stackPrefab);
    }

    // spawn stack configured from level JSON data
    public createConfiguredStack(data: HexSpawnData, materials: Material[]): Node {
        const stackNode = this.createStack();
        const hexStack = stackNode.getComponent(HexStack);

        if (hexStack) {
            hexStack.colorId = data.colorId;
            hexStack.tileCount = data.tileCount;
            hexStack.syncVisualTiles();
        }

        // offset collider center after visual tiles are synced
        const collider = stackNode.getComponent(BoxCollider);
        if (collider) {
            collider.center = new Vec3(0, -0.08, 0);
        }

        // apply corresponding shared material
        stackNode.children.forEach(child => {
            const meshRenderer = child.getComponentInChildren(MeshRenderer);
            if (meshRenderer && materials && materials[data.colorId]) {
                meshRenderer.setSharedMaterial(materials[data.colorId], 0);
            }
        });

        return stackNode;
    }
}


