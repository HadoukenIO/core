import * as ts from 'typescript';
import * as Lint from 'tslint';

export class Rule extends Lint.Rules.AbstractRule {
    public static metadata: Lint.IRuleMetadata = {
        ruleName: 'no-fs',
        description: 'Bans the use of fs.',
        rationale:
            'fs.readFileSync will not work correctly because we will be adding asar verification' +
            'and it will require every filename.ext being read to need a filename.ext.ofds file associated with it.',
        optionsDescription: '',
        options: {
            type: 'array',
            items: { type: 'string' }
        },
        optionExamples: ['readFileSync'],
        type: 'functionality',
        typescriptOnly: false
    };

    public static FAILURE_STRING = 'Use `original-fs` instead of `fs` when importing readFileSync';

    public apply(sourceFile: ts.SourceFile): Lint.RuleFailure[] {
        return this.applyWithFunction(sourceFile, walk);
    }
}

function walk(ctx: Lint.WalkContext<void>) {
    // Recursively walk the AST starting with root node, `ctx.sourceFile`.
    // Call the function `cb` (defined below) for each child.
    return ts.forEachChild(ctx.sourceFile, cb);

    function cb(node: ts.ImportDeclaration): void {
        if (node.kind === ts.SyntaxKind.ImportDeclaration) {
            if ((<ts.StringLiteral>node.moduleSpecifier).text === 'fs') {
                // check if we have any named imports
                if (node.importClause) {
                    hasReadFileSync(node.importClause);
                }
            }
        }
        return ts.forEachChild(node, cb);
    }

    function hasReadFileSync(node: ts.Node): void {
        if (node.kind === ts.SyntaxKind.Identifier) {
            if (node.getText() === 'readFileSync') {
                return ctx.addFailureAtNode(node, Rule.FAILURE_STRING);
            }
        }
        return ts.forEachChild(node, hasReadFileSync);
    }
}
