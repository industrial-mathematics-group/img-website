# Exports the built-in examples of PDEStudioCore as data for the PDEStudio demo page
# (src/pages/explore/pdestudio.astro). Run from the repository root:
#
#     julia --project=tools/pdestudio-demo -e 'using Pkg; Pkg.instantiate()'
#     julia --project=tools/pdestudio-demo tools/pdestudio-demo/export.jl
#
# Writes public/pdestudio/<example>.json. Each file holds the SimulationConfig (as val2str literals, like the
# Shared and Advanced tabs), and for every method and swept value the solution and the statistics of the
# "hyperbolic" preset. Grid data is resampled by PDEStudioCore (load_sim_data with a resolution, as PDEStudio's
# Files → Resolution does) and stored as 16-bit integers per run; particle data keeps the computed time steps.
using PDEStudioCore
using Base64

const OUT = normpath(joinpath(@__DIR__, "..", "..", "public", "pdestudio"))
const EXAMPLES = (:test_advection_1d, :test_burgers_1d, :test_heat_1d, :test_heat_2d, :test_poisson_2d,
                  :test_particles_2d)
# Points per axis of the exported grid data: space at most the native resolution, time fixed.
const MAX_SPACE = (1 => 200, 2 => 41)
const TIME_POINTS = (1 => 101, 2 => 26)
const MAX_PARTICLE_FRAMES = 101

# --- A small JSON writer (no dependency) -------------------------------------------------------------------------

json(io, x::AbstractString) = (write(io, '"'); write(io, escape_string(x, "\"")); write(io, '"'))
json(io, x::Symbol) = json(io, String(x))
json(io, x::Bool) = print(io, x)
json(io, ::Nothing) = print(io, "null")
json(io, x::Integer) = print(io, x)
json(io, x::Real) = isfinite(x) ? print(io, round(Float64(x); sigdigits = 5)) : print(io, "null")
function json(io, x::AbstractVector)
    write(io, '[')
    for (i, v) in enumerate(x)
        i > 1 && write(io, ',')
        json(io, v)
    end
    write(io, ']')
end
function json(io, x::AbstractDict)
    write(io, '{')
    for (i, (k, v)) in enumerate(x)
        i > 1 && write(io, ',')
        json(io, string(k))
        write(io, ':')
        json(io, v)
    end
    write(io, '}')
end
json(x) = sprint(json, x)

# --- Packing ------------------------------------------------------------------------------------------------------

# Values as Int16 between `lo` and `hi` (base64, little endian); non-finite values become -32768.
function pack(values)
    finite = filter(isfinite, values)
    lo, hi = isempty(finite) ? (0.0, 0.0) : Float64.(extrema(finite))
    scale = hi > lo ? (hi - lo) / 65534 : 1.0
    q = Int16[isfinite(v) ? Int16(round(Int, (v - lo) / scale) - 32767) : typemin(Int16) for v in values]
    return Dict("lo" => lo, "scale" => scale, "data" => base64encode(reinterpret(UInt8, htol.(q))))
end

# Statistics as plain numbers: time series and scalars, first component (all examples are scalar). A time series
# is a vector of component vectors; a statistic without dimensions is a single component vector.
function stats_of(sim, keep = nothing)
    out = Dict{String, Any}()
    for (name, v) in sim.stats
        name === :Solution && continue
        if eltype(v) <: AbstractVector
            series = [x[1] for x in v]
            out[string(name)] = keep === nothing ? series : series[keep]
        else
            out[string(name)] = v[1]
        end
    end
    return out
end

# The docstring of an example function (PDEStudioCore.Examples), as written (Markdown).
function doc_text(name::Symbol)
    mod = PDEStudioCore.Examples
    multidoc = Base.Docs.meta(mod)[Base.Docs.Binding(mod, name)]
    text = join((join(d.text) for d in values(multidoc.docs)), "\n\n")
    return String(strip(replace(text, r"^    \w+\(.*\n"m => "", count = 1)))
end

# --- One example -------------------------------------------------------------------------------------------------

function sweep_runs(cfg)
    (k, values), = cfg.varied         # every example sweeps one parameter
    return k, values
end

function params_for(cfg, m, k, v)
    p = assemble_params(cfg.shared, cfg.methods, m)
    p[k] = v
    return p
end

function export_example(name::Symbol)
    cfg = getfield(PDEStudioCore, name)()
    run_all_simulations(cfg; parallel = false, calculate_stats = true)
    k, values = sweep_runs(cfg)
    numeric = filter(!is_reference_method, cfg.defaults)
    template = load_sim_data(params_for(cfg, first(numeric), k, first(values)), Val(:raw))
    lagrangian = template isa LSimData
    dims = collect(template.domain.dim_keys)
    nspace = length(dims) - 1
    ref_factory = cfg.reference === nothing ? nothing : resolve_dynamic_function(cfg.reference)

    res = nothing
    if !lagrangian
        native = maximum(map(length, load_sim_data(params_for(cfg, m, k, v), Val(:raw)).axes[1:nspace])
                         for m in numeric for v in values)
        nx = min(native[1], last(MAX_SPACE[nspace]))
        res = (ntuple(_ -> nx, nspace)..., last(TIME_POINTS[nspace]))
    end

    runs = Dict{String, Any}()
    axes = nothing
    for m in cfg.defaults
        runs[string(m)] = map(values) do v
            p = params_for(cfg, m, k, v)
            if is_reference_method(m)
                ref_func = ref_factory(p)
                domain = load_sim_data(params_for(cfg, first(numeric), k, v), Val(:raw)).domain
                sim = generate_reference_simdata(ref_func, p, domain, res, Val(:eulerian))
                calculate_all_stats!(sim, ref_func; save = false)
            elseif lagrangian
                sim = load_sim_data(p, Val(:raw))
                keep = unique(round.(Int, range(1, length(sim.t), length = min(length(sim.t), MAX_PARTICLE_FRAMES))))
                xs = [sim.x[i][j][d] for d in 1:nspace, j in eachindex(sim.x[1]), i in keep]
                us = [sim.u[i][j][1] for j in eachindex(sim.u[1]), i in keep]
                return Dict("t" => sim.t[keep], "positions" => pack(vec(xs)), "u" => pack(vec(us)),
                            "count" => length(sim.x[1]), "stats" => stats_of(sim, keep))
            else
                sim = load_sim_data(p, Val(:eulerian), res)
            end
            axes === nothing && (axes = Dict(string(d) => sim.axes[i] for (i, d) in enumerate(dims)))
            return Dict("solution" => pack(vec([x[1] for x in sim.u])), "stats" => stats_of(sim))
        end
    end

    stat_dims = Dict(string(s) => (d isa AbstractVector ? string.(d) : [string(d)])
                     for (s, d) in get_stat_registry() if s !== :Solution)
    config = Dict(
        "shared" => Dict(string(key) => val2str(val) for (key, val) in cfg.shared),
        "methods" => Dict(string(m) => Dict(string(key) => val2str(val) for (key, val) in ps) for (m, ps) in cfg.methods),
        # The methods as nested literals, for the Advanced tab: Dict(:scheme => "upwind")
        "method_literals" => Dict(string(m) => "Dict(" * join((":$key => $(val2str(val; top_level = false))"
                                                               for (key, val) in sort(collect(ps), by = first)), ", ") * ")"
                                  for (m, ps) in cfg.methods),
        "defaults" => string.(cfg.defaults),
        "varied" => Dict(string(key) => val2str.(vals) for (key, vals) in cfg.varied),
        "reference" => cfg.reference === nothing ? nothing : string(cfg.reference),
        "postprocess" => cfg.postprocess === nothing ? nothing : string(cfg.postprocess),
        "sources" => string.(cfg.sources),
    )
    data = Dict(
        "name" => string(name),
        "doc" => doc_text(name),
        "solver_doc" => doc_text(cfg.shared[:sim_func_name]),
        "kind" => lagrangian ? "lagrangian" : "eulerian",
        "dims" => string.(dims),
        "time_dim" => string(template.domain.time_dim),
        "sweep" => Dict("key" => string(k), "values" => values),
        "axes" => axes,
        "stat_dims" => stat_dims,
        "config" => config,
        "runs" => runs,
        "versions" => Dict("PDEStudioCore" => string(pkgversion(PDEStudioCore))),
    )
    path = joinpath(OUT, "$(name).json")
    write(path, json(data))
    println(rpad(string(name), 20), " ", lagrangian ? "particles" : "grid $(res)", "  ",
            round(filesize(path) / 1024, digits = 1), " KiB")
end

set_save_path!(mktempdir())
set_stat_preset!("hyperbolic")
mkpath(OUT)
foreach(export_example, EXAMPLES)
