interface CommitInfo {
    hash: string;
    author: string;
    date: string;
    message: string;
}

interface BlameInfo {
    hash: string;
    author: string;
    date: string;
    line: number;
    content: string;
}


export {
    BlameInfo,
    CommitInfo
}