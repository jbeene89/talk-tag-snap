package com.soupytag.app;

import android.os.Process;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

final class DocumentIo {
    private static final ThreadPoolExecutor EXECUTOR = new ThreadPoolExecutor(
        1,
        1,
        30L,
        TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1),
        new ThreadFactory() {
            private final AtomicInteger nextId = new AtomicInteger(1);

            @Override
            public Thread newThread(Runnable task) {
                Thread thread = new Thread(() -> {
                    Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);
                    task.run();
                }, "SoupyDocument-" + nextId.getAndIncrement());
                thread.setDaemon(true);
                return thread;
            }
        },
        new ThreadPoolExecutor.AbortPolicy()
    );

    private DocumentIo() {}

    static void execute(Runnable task) throws RejectedExecutionException {
        EXECUTOR.execute(task);
    }
}
