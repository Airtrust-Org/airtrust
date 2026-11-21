import { useState } from 'react';
import { ChevronRight, ChevronDown, Folder, File, Download, ExternalLink } from 'lucide-react';
import Button from '@/react-app/components/Button';
import Badge from '@/react-app/components/Badge';

export interface TreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  children?: TreeNode[];
  metadata?: {
    size_bytes?: number;
    created_at?: string;
    modified_at?: string;
    download_url?: string;
    file_type?: string;
    status?: string;
    extra_info?: Record<string, any>;
  };
}

interface TreeViewProps {
  data: TreeNode[];
  onFileClick?: (node: TreeNode) => void;
  onDownload?: (node: TreeNode) => void;
  renderNodeActions?: (node: TreeNode) => React.ReactNode;
  className?: string;
  expandAll?: boolean;
}

interface TreeNodeComponentProps {
  node: TreeNode;
  level: number;
  expandedNodes: Set<string>;
  onToggleExpand: (nodeId: string) => void;
  onFileClick?: (node: TreeNode) => void;
  onDownload?: (node: TreeNode) => void;
  renderNodeActions?: (node: TreeNode) => React.ReactNode;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function getFileIcon(node: TreeNode) {
  if (node.type === 'folder') {
    return <Folder className="w-4 h-4 text-primary" />;
  }
  
  const fileType = node.metadata?.file_type?.toLowerCase();
  
  if (fileType?.includes('pdf')) {
    return <File className="w-4 h-4 text-red-600" />;
  } else if (fileType?.includes('image')) {
    return <File className="w-4 h-4 text-green-600" />;
  } else if (fileType?.includes('document') || fileType?.includes('word')) {
    return <File className="w-4 h-4 text-primary" />;
  } else {
    return <File className="w-4 h-4 text-gray-600" />;
  }
}

function TreeNodeComponent({ 
  node, 
  level, 
  expandedNodes, 
  onToggleExpand, 
  onFileClick, 
  onDownload,
  renderNodeActions 
}: TreeNodeComponentProps) {
  const isExpanded = expandedNodes.has(node.id);
  const hasChildren = node.children && node.children.length > 0;
  const indentLevel = level * 20;

  const handleToggle = () => {
    if (hasChildren) {
      onToggleExpand(node.id);
    } else if (node.type === 'file' && onFileClick) {
      onFileClick(node);
    }
  };

  const handleDownload = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDownload) {
      onDownload(node);
    }
  };

  return (
    <>
      {/* Current Node */}
      <div
        className={`
          flex items-center justify-between py-2 px-3 rounded-lg border transition-all duration-200
          ${node.type === 'folder' 
            ? 'bg-primary/10 border-blue-200 hover:bg-primary/20' 
            : 'bg-white border-gray-200 hover:bg-gray-50'
          }
          ${hasChildren || node.type === 'file' ? 'cursor-pointer' : ''}
        `}
        style={{ marginLeft: `${indentLevel}px` }}
        onClick={handleToggle}
      >
        <div className="flex items-center space-x-3 flex-1 min-w-0">
          {/* Expand/Collapse Icon */}
          <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-600" />
              )
            ) : null}
          </div>
          
          {/* File/Folder Icon */}
          <div className="flex-shrink-0">
            {getFileIcon(node)}
          </div>
          
          {/* Node Name and Metadata */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center space-x-2">
              <span className={`font-medium truncate ${
                node.type === 'folder' ? 'text-blue-900' : 'text-gray-900'
              }`}>
                {node.name}
              </span>
              
              {node.metadata?.status && (
                <Badge 
                  size="sm" 
                  variant={
                    node.metadata.status === 'SINCRONIZADO' ? 'success' :
                    node.metadata.status === 'ERRO' ? 'danger' : 'warning'
                  }
                >
                  {node.metadata.status}
                </Badge>
              )}
            </div>
            
            {node.metadata && node.type === 'file' && (
              <div className="text-xs text-gray-500 mt-1 space-y-1">
                <div className="flex items-center space-x-4">
                  {node.metadata.size_bytes && (
                    <span>{formatFileSize(node.metadata.size_bytes)}</span>
                  )}
                  {node.metadata.created_at && (
                    <span>
                      Criado: {new Date(node.metadata.created_at).toLocaleDateString('pt-BR')}
                    </span>
                  )}
                </div>
                
                {node.metadata.extra_info && (
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(node.metadata.extra_info).map(([key, value]) => (
                      <Badge key={key} size="sm" variant="neutral">
                        {key}: {String(value)}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Actions */}
        <div className="flex items-center space-x-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
          {renderNodeActions && renderNodeActions(node)}
          
          {node.type === 'file' && node.metadata?.download_url && onDownload && (
            <Button
              size="sm"
              variant="primary"
              onClick={handleDownload}
              title="Download"
            >
              <Download className="w-3 h-3" />
            </Button>
          )}
          
          {node.type === 'file' && node.metadata?.download_url && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                if (node.metadata?.download_url) {
                  window.open(node.metadata.download_url, '_blank');
                }
              }}
              title="Abrir"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-2 space-y-2">
          {node.children!.map(child => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              expandedNodes={expandedNodes}
              onToggleExpand={onToggleExpand}
              onFileClick={onFileClick}
              onDownload={onDownload}
              renderNodeActions={renderNodeActions}
            />
          ))}
        </div>
      )}
    </>
  );
}

export default function TreeView({
  data,
  onFileClick,
  onDownload,
  renderNodeActions,
  className = "",
  expandAll = false
}: TreeViewProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    if (expandAll) {
      const allNodeIds = new Set<string>();
      const collectIds = (nodes: TreeNode[]) => {
        nodes.forEach(node => {
          if (node.type === 'folder') {
            allNodeIds.add(node.id);
          }
          if (node.children) {
            collectIds(node.children);
          }
        });
      };
      collectIds(data);
      return allNodeIds;
    }
    return new Set();
  });

  const onToggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(nodeId)) {
        newSet.delete(nodeId);
      } else {
        newSet.add(nodeId);
      }
      return newSet;
    });
  };

  const expandAllNodes = () => {
    const allNodeIds = new Set<string>();
    const collectIds = (nodes: TreeNode[]) => {
      nodes.forEach(node => {
        if (node.type === 'folder') {
          allNodeIds.add(node.id);
        }
        if (node.children) {
          collectIds(node.children);
        }
      });
    };
    collectIds(data);
    setExpandedNodes(allNodeIds);
  };

  const collapseAllNodes = () => {
    setExpandedNodes(new Set());
  };

  if (data.length === 0) {
    return (
      <div className={`text-center py-8 text-gray-500 ${className}`}>
        <Folder className="w-12 h-12 text-gray-400 mx-auto mb-2" />
        <p>Nenhum item encontrado</p>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-600">
          {data.length} item(s) na raiz
        </div>
        <div className="flex space-x-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={expandAllNodes}
          >
            Expandir Tudo
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={collapseAllNodes}
          >
            Recolher Tudo
          </Button>
        </div>
      </div>
      
      {/* Tree */}
      <div className="space-y-2">
        {data.map(node => (
          <TreeNodeComponent
            key={node.id}
            node={node}
            level={0}
            expandedNodes={expandedNodes}
            onToggleExpand={onToggleExpand}
            onFileClick={onFileClick}
            onDownload={onDownload}
            renderNodeActions={renderNodeActions}
          />
        ))}
      </div>
    </div>
  );
}
