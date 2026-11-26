// SPDX-License-Identifier: MPL-2.0
//
// Thin WASI reactor adapter around D2 v0.9.0's open-source TALA layout engine
// (github.com/d2lang/d2/d2layouts/d2talalayout, MPL-2.0). Compiled to
// plugins/diagram/src/tala.wasm.br via plugins/diagram/scripts/build-tala-wasm.mjs
// and executed synchronously at compile time in Node.js (never shipped to
// @joplo-app/web or published sites).
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"strconv"
	"unsafe"

	"github.com/d2lang/d2/d2ast"
	"github.com/d2lang/d2/d2graph"
	"github.com/d2lang/d2/d2layouts"
	"github.com/d2lang/d2/d2layouts/d2talalayout"
	"github.com/d2lang/d2/d2target"
	"github.com/d2lang/d2/lib/geo"
	"github.com/d2lang/d2/lib/label"
)

type InputNode struct {
	ID             string  `json:"id"`
	Parent         string  `json:"parent,omitempty"`
	IsContainer    bool    `json:"isContainer,omitempty"`
	ForceHierarchy bool    `json:"forceHierarchy,omitempty"`
	Direction      string  `json:"direction,omitempty"`
	Near           string  `json:"near,omitempty"`
	Label          string  `json:"label,omitempty"`
	LabelPos       string  `json:"labelPos,omitempty"`
	W              float64 `json:"w"`
	H              float64 `json:"h"`
	LW             int     `json:"lw,omitempty"`
	LH             int     `json:"lh,omitempty"`
}

type InputEdge struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	To        string `json:"to"`
	Reversed  bool   `json:"reversed,omitempty"`
	Invisible bool   `json:"invisible,omitempty"`
	Label     string `json:"label,omitempty"`
	LW        int    `json:"lw,omitempty"`
	LH        int    `json:"lh,omitempty"`
	Async     bool   `json:"async,omitempty"`
}

type InputGraph struct {
	Direction      string      `json:"direction,omitempty"`
	ForceHierarchy bool        `json:"forceHierarchy,omitempty"`
	Seeds          []int64     `json:"seeds,omitempty"`
	Nodes          []InputNode `json:"nodes"`
	Edges          []InputEdge `json:"edges"`
}

type OutBox struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type OutPoint struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type OutEdge struct {
	Points []OutPoint `json:"points"`
	Label  *OutBox    `json:"label"`
}

type OutputGraph struct {
	Error  string             `json:"error,omitempty"`
	Boxes  map[string]OutBox  `json:"boxes,omitempty"`
	Labels map[string]OutBox  `json:"labels,omitempty"`
	Edges  map[string]OutEdge `json:"edges,omitempty"`
}

var (
	inBuf  []byte
	outBuf []byte
)

//go:wasmexport tala_alloc
func talaAlloc(size uint32) unsafe.Pointer {
	if size == 0 {
		size = 1
	}
	if cap(inBuf) < int(size) {
		inBuf = make([]byte, size)
	} else {
		inBuf = inBuf[:size]
	}
	return unsafe.Pointer(&inBuf[0])
}

//go:wasmexport tala_out_ptr
func talaOutPtr() unsafe.Pointer {
	if len(outBuf) == 0 {
		return nil
	}
	return unsafe.Pointer(&outBuf[0])
}

//go:wasmexport tala_out_len
func talaOutLen() uint32 {
	return uint32(len(outBuf))
}

//go:wasmexport tala_layout
func talaLayout(ptr unsafe.Pointer, size uint32) uint32 {
	raw := unsafe.Slice((*byte)(ptr), size)
	res := runLayout(raw)
	outBuf, _ = json.Marshal(res)
	return uint32(len(outBuf))
}

func appendPreorder(obj *d2graph.Object, out *[]*d2graph.Object) {
	for _, child := range obj.ChildrenArray {
		*out = append(*out, child)
		appendPreorder(child, out)
	}
}

func runLayout(raw []byte) OutputGraph {
	var in InputGraph
	if err := json.Unmarshal(raw, &in); err != nil {
		return OutputGraph{Error: err.Error()}
	}
	g := d2graph.NewGraph()
	if in.Direction == "right" || in.Direction == "down" || in.Direction == "left" || in.Direction == "up" {
		g.Root.Direction = d2graph.Scalar{Value: in.Direction}
	}
	if in.ForceHierarchy {
		g.Root.Shape = d2graph.Scalar{Value: d2target.ShapeHierarchy}
	}

	objs := make(map[string]*d2graph.Object, len(in.Nodes))
	d2ToJoploID := make(map[string]string, len(in.Nodes))
	for _, n := range in.Nodes {
		// Lowercase hex encoding avoids D2 case-folding collisions and key-path delimiters.
		d2ID := fmt.Sprintf("n_%x", []byte(n.ID))
		d2ToJoploID[d2ID] = n.ID
		w := math.Max(8, math.Round(n.W))
		h := math.Max(8, math.Round(n.H))
		obj := &d2graph.Object{
			Graph:    g,
			ID:       d2ID,
			IDVal:    d2ID,
			Box:      geo.NewBox(geo.NewPoint(0, 0), w, h),
			Children: make(map[string]*d2graph.Object),
		}
		if n.ForceHierarchy {
			obj.Shape = d2graph.Scalar{Value: d2target.ShapeHierarchy}
		} else {
			obj.Shape = d2graph.Scalar{Value: d2target.ShapeRectangle}
		}
		if n.Direction == "right" || n.Direction == "down" || n.Direction == "left" || n.Direction == "up" {
			obj.Direction = d2graph.Scalar{Value: n.Direction}
		}
		if n.Near != "" {
			obj.NearKey = d2ast.MakeKeyPath([]string{n.Near})
		}
		obj.Style.FontSize = &d2graph.Scalar{Value: "14"}
		obj.Style.Fill = &d2graph.Scalar{Value: "#ffffff"}
		if !n.IsContainer {
			wStr := strconv.Itoa(int(w))
			hStr := strconv.Itoa(int(h))
			obj.WidthAttr = &d2graph.Scalar{Value: wStr}
			obj.HeightAttr = &d2graph.Scalar{Value: hStr}
		}
		if n.Label != "" || (n.LW > 0 && n.LH > 0) {
			txt := n.Label
			if txt == "" {
				txt = " "
			}
			obj.Label = d2graph.Scalar{Value: txt}
			obj.LabelDimensions = d2target.TextDimensions{
				Width:  max(1, n.LW),
				Height: max(1, n.LH),
			}
			if n.LabelPos != "" {
				pos := n.LabelPos
				obj.LabelPosition = &pos
			}
		}
		objs[n.ID] = obj
	}

	for _, n := range in.Nodes {
		obj := objs[n.ID]
		parent := g.Root
		if n.Parent != "" {
			if p, ok := objs[n.Parent]; ok {
				parent = p
			}
		}
		obj.Parent = parent
		parent.Children[obj.ID] = obj
		parent.ChildrenArray = append(parent.ChildrenArray, obj)
	}
	g.Objects = make([]*d2graph.Object, 0, len(in.Nodes))
	appendPreorder(g.Root, &g.Objects)

	invisibleIDs := make(map[string]bool)
	pairCounts := make(map[string]int)
	for _, e := range in.Edges {
		src, ok1 := objs[e.From]
		dst, ok2 := objs[e.To]
		if !ok1 || !ok2 {
			continue
		}
		pairKey := src.AbsID() + "->" + dst.AbsID()
		idx := pairCounts[pairKey]
		pairCounts[pairKey] = idx + 1
		idCopy := e.ID
		de := &d2graph.Edge{
			Src:      src,
			Dst:      dst,
			SrcArrow: e.Reversed,
			DstArrow: !e.Reversed,
			Index:    idx,
		}
		de.Tooltip = &d2graph.Scalar{Value: idCopy}
		if e.Invisible {
			invisibleIDs[e.ID] = true
			de.Style.Opacity = &d2graph.Scalar{Value: "0"}
		} else {
			if e.Label != "" {
				de.Label = d2graph.Scalar{Value: e.Label}
				de.LabelDimensions = d2target.TextDimensions{
					Width:  max(1, e.LW),
					Height: max(1, e.LH),
				}
			}
			if e.Async {
				de.Style.StrokeDash = &d2graph.Scalar{Value: "5"}
			}
		}
		g.Edges = append(g.Edges, de)
	}

	opts := d2talalayout.DefaultOptions()
	opts.MaxConcurrency = 1
	if len(in.Seeds) > 0 {
		opts.Seeds = in.Seeds
	}
	coreLayout := func(ctx context.Context, sub *d2graph.Graph) error {
		return d2talalayout.Layout(ctx, sub, &opts)
	}
	if err := d2layouts.LayoutNested(context.Background(), g, d2layouts.GraphInfo{}, coreLayout, d2talalayout.RouteEdges); err != nil {
		return OutputGraph{Error: err.Error()}
	}

	out := OutputGraph{
		Boxes:  make(map[string]OutBox, len(g.Objects)),
		Labels: make(map[string]OutBox),
		Edges:  make(map[string]OutEdge, len(g.Edges)),
	}
	for _, obj := range g.Objects {
		if obj == nil || obj.Box == nil || obj.TopLeft == nil {
			continue
		}
		jID, ok := d2ToJoploID[obj.ID]
		if !ok {
			continue
		}
		out.Boxes[jID] = OutBox{X: obj.TopLeft.X, Y: obj.TopLeft.Y, W: obj.Width, H: obj.Height}
		if obj.LabelPosition != nil && obj.LabelDimensions.Width > 0 && obj.LabelDimensions.Height > 0 {
			pos := label.FromString(*obj.LabelPosition)
			lw := float64(obj.LabelDimensions.Width)
			lh := float64(obj.LabelDimensions.Height)
			pt := pos.GetPointOnBox(obj.Box, label.PADDING, lw, lh)
			if pt != nil {
				out.Labels[jID] = OutBox{X: pt.X, Y: pt.Y, W: lw, H: lh}
			}
		}
	}
	for _, de := range g.Edges {
		if de == nil || de.Tooltip == nil {
			continue
		}
		eID := de.Tooltip.Value
		if invisibleIDs[eID] {
			continue
		}
		pts := make([]OutPoint, 0, len(de.Route))
		for _, p := range de.Route {
			pts = append(pts, OutPoint{X: p.X, Y: p.Y})
		}
		var lb *OutBox
		if de.Label.Value != "" && de.LabelPosition != nil && len(de.Route) >= 2 {
			pos := label.FromString(*de.LabelPosition)
			pct := 0.5
			if de.LabelPercentage != nil {
				pct = *de.LabelPercentage
			}
			lw := float64(de.LabelDimensions.Width)
			lh := float64(de.LabelDimensions.Height)
			pt, _ := pos.GetPointOnRoute(de.Route, -4, pct, lw, lh)
			if pt != nil {
				lb = &OutBox{X: pt.X, Y: pt.Y, W: lw, H: lh}
			}
		}
		out.Edges[eID] = OutEdge{Points: pts, Label: lb}
	}
	return out
}

func main() {}
