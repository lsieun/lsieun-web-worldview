/**
 * ViewBuilder.js — 视图构建基类
 *
 * 定义 build(view, ctx) 接口，所有视图类型的 builder 都继承此类。
 * 加新视图类型 = 新建子类 + 在 World.js 的 switch 里加一行 case。
 */
export class ViewBuilder {
    /**
     * @param {object} view   views 目录下读出来的单个视图实体
     * @param {import("../WorldContext.js").WorldContext} ctx
     * @returns {object} 组装好的视图数据，挂到 world 输出里
     */
    build(view, ctx) {
        throw new Error(`子类必须实现 build(view, ctx)`);
    }
}
